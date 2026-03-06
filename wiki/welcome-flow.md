# Welcome Flow

> **Last verified:** 2026-02-27
> **Source files:** `public/app.js` (lines 906-1031: `runWelcomeFlow()`), `server.js` (lines 1087-1200: `/api/welcome-status`, `/api/welcome`)
> **Known gaps:** None

---

## Overview

The welcome flow provides two experiences depending on whether a user is new or returning:

- **New users** — Interactive onboarding that captures name, favorite color, and interests via a guided chat conversation
- **Returning users** — Personalized greeting message that varies based on days since last visit and streak length

## First-Time Detection

```
Page Load
    │
    ▼
Check localStorage: melodyWelcomeDone-{userId}
    │
    ├── EXISTS → Returning user path
    │       │
    │       ▼
    │   GET /api/welcome-status?userId={userId}
    │       │
    │       ├── { status: 'new' }       → Keep default welcome text
    │       └── { status: 'returning' } → Show personalized greeting
    │
    └── MISSING → First-time interactive welcome
            │
            ▼
        runWelcomeFlow() interactive sequence
```

The localStorage key is **per-user**: `melodyWelcomeDone-amelia`, `melodyWelcomeDone-lonnie`, etc. This means each user identity goes through the welcome flow independently.

## Welcome Sequence

The interactive onboarding consists of three capture steps, each with Melody typing delays and chime sounds:

### Step 1: Name

```
Melody: "Yaaan~! A new friend! Hello hello! I'm My Melody, and I live
         in Mariland with my Mama, Papa, and little brother Rhythm~
         I'm so happy to meet you!"

Melody: "Mama always says you should start a friendship by learning
         each other's names... so, what's your name?"

[User types name]

Melody: "{Name}! What a lovely name~ Mama would say it sounds like a
         flower name... even if it doesn't, hehe. I'll remember it
         forever!"
```

The input is processed: first word extracted as the display name, full input saved to mem0 for context.

### Step 2: Color

```
Melody: "Oh! I'm curious~ what's your favorite color? Mine is pink,
         of course... because of my hood!"

[User types color]

Melody: "{Color}! Ahh~ that's such a pretty color! I can see why you
         like it. I'll remember that about you, {Name}!"
```

The color input is matched against `COLOR_MAP` to set the UI accent color.

### Step 3: Interests

```
Melody: "One more thing... what do you like to do for fun? Any hobbies
         or interests? I want to know everything about my new friend~!
         Onegai?"

[User types interests]

Melody: "That sounds wonderful! Mama always says the best friendships
         start with sharing what makes you happy~"

Melody: "I'm so glad we're friends now! You can talk to me about
         anything, anytime~ I'll always be here with tea and almond
         pound cake!"
```

### Flow Mechanics

During the welcome flow:

- `welcomeActive = true` — The `sendMessage()` function routes input to `welcomeResolve` instead of the chat API
- The image attach button is hidden (`imageBtn.style.display = 'none'`)
- Input placeholder text changes per step ("Type your name...", "Type your favorite color...", "Tell me what you like...")
- Typing delays simulate natural conversation pacing (600-1000ms)
- After completion, `melodyWelcomeDone-{userId}` is set in localStorage and normal chat mode resumes

## POST /api/welcome

Saves each onboarding data point to mem0.

### Request

```json
{
  "type": "name" | "color" | "interests",
  "value": "string (max 200 chars)",
  "userId": "amelia" | "lonnie" | "guest"
}
```

### Validation

| Rule | Response |
|------|----------|
| Missing `type` or `value` | 400 `{ error: "type and value required" }` |
| `value` not a string or > 200 chars | 400 `{ error: "Invalid value" }` |
| Unknown `type` | 400 `{ error: "Invalid type" }` |

### mem0 Save Behavior

| Type | Memory Text Saved |
|------|-------------------|
| `name` | `Friend's name is {firstName}. They said: "{fullInput}"` |
| `color` | `Friend's favorite color is {value}` |
| `interests` | `Friend's interests and hobbies include: {value}` |

**Guest users**: The mem0 save is **skipped** when `userId === 'guest'`. Guest users still complete the welcome flow visually, but nothing is persisted to the user memory track.

### Relationship Initialization

On the first `/api/welcome` call for a user, if `firstChat` is null, the relationship record is initialized:

```js
{
  firstChat: today,       // ISO date string
  totalChats: 0,
  lastChatDate: today,
  lastStreakDate: today,
  streakDays: 1,
  milestones: []
}
```

## Returning User Greeting

When `melodyWelcomeDone-{userId}` exists in localStorage, the flow fetches `GET /api/welcome-status?userId={userId}` and generates a personalized greeting:

| Condition | Greeting Template |
|-----------|-------------------|
| Same day, streak > 2 | "Welcome back, {name}! That's {streak} days in a row~ I'm so happy!" |
| Same day, streak <= 2 | "Hi again, {name}! I was just having some tea and thinking about you~" |
| 1 day since last chat | "{name}! You came back! I was just baking almond pound cake and hoping you'd visit~" |
| 2-3 days since last chat | "{name}~! It's been {days} days! I missed chatting with you... Mama says absence makes the heart grow fonder!" |
| 4+ days since last chat | "{name}!! Yaaan~! It's been {days} whole days! I missed you so much... I saved you some tea!" |

The greeting replaces the default welcome message text in the chat area.

### GET /api/welcome-status

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | query string | No | User key. Falls back to legacy data if omitted. |

**Response — new user:**

```json
{ "status": "new" }
```

**Response — returning user:**

```json
{
  "status": "returning",
  "friendName": "Amelia",
  "daysSince": 1,
  "totalChats": 42,
  "streakDays": 3
}
```

The `friendName` is resolved by:

1. Looking up `KNOWN_USERS[userId].name` (preferred — instant)
2. Falling back to searching mem0 for a "friend name" memory and extracting the name via regex

## Color-to-Accent Mapping

The `COLOR_MAP` object in `app.js` maps color name inputs to hex values applied as the CSS `--accent-highlight` variable:

| Color | Hex | Color | Hex |
|-------|-----|-------|-----|
| red | `#E74C3C` | purple | `#9B59B6` |
| pink / hotpink | `#FF69B4` | violet | `#7C4DFF` |
| rose | `#FF6B81` | lavender | `#B39DDB` |
| blue | `#3498DB` | lilac | `#C8A2C8` |
| navy | `#2C3E8C` | orange | `#FF9800` |
| skyblue | `#5DADE2` | coral | `#FF7675` |
| cyan | `#00BCD4` | peach | `#FFAB91` |
| teal | `#009688` | salmon | `#FA8072` |
| green | `#27AE60` | yellow | `#F1C40F` |
| mint | `#00D2A0` | gold | `#FFD700` |
| lime | `#8BC34A` | black | `#5C4155` |
| sage | `#8FBC8F` | white | `#FF69B4` |

The accent color is persisted to `localStorage.accentColor` and restored on page load.

## When Welcome Flow Re-Triggers

The welcome flow runs again if:

- `melodyWelcomeDone-{userId}` is cleared from localStorage (manually or via browser settings)
- The user opens the app in incognito/private browsing mode
- A new user identity is selected via the user picker that has not completed the flow
- localStorage is cleared entirely

---

## Related Pages

- [User Identity](user-identity.md) — Per-user welcome state and user picker
- [Relationship Tracking](relationship-tracking.md) — Stats initialized during welcome
- [Character Guide](character-guide.md) — Melody's personality during onboarding
