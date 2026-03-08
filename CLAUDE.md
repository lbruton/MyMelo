# My Melody Chat v2.5

> See `~/.claude/CLAUDE.md` for global workflow rules (push safety, version checkout gate, PR lifecycle, MCP tools, code search tiers, UI design workflow, plugins).

A My Melody (Sanrio) companion chat app with persistent memory, image vision, web search, game wiki integration, a growing friendship system, PWA install, notification sounds, and a first-time welcome flow.

## Branching & Workflow

- **`main`** — Protected via Codacy PR gate. Never push directly.
- **`fix/` or `feat/` branches** — Created from `main` for each change.
- Flow: feature branch → push → PR to `main` → Codacy → merge → redeploy via Portainer

### Project Workflow Overrides (vs global CLAUDE.md)

This project runs on Portainer (VM 101, `192.168.1.81`, Stack ID 9, ports 3030/3031). These global rules are **relaxed**:

- **No `dev` branch** — `main` only. PRs target `main` directly.
- **No version lock** — `/release patch` and `/start-patch` do NOT apply.
- **Worktrees optional** — A simple `git checkout -b fix/xxx` from `main` is fine. Worktrees are available but not mandatory.
- **No Browserbase tests** — Manual testing on the Portainer deployment.
- **No deploy-verify** — Portainer handles deployment, no Fly.io.
- **No local Docker** — Do NOT run `docker-compose` on Mac. The app runs on the VM.

### What DOES apply (non-negotiable)

- **Linear issue for every code change** — No cowboy coding.
- **Spec-workflow for features** — Requirements → Design → Tasks → Implementation with dashboard approvals. Bug fixes with clear root cause may skip the spec.
- **PR gate** — All code reaches `main` via PR. Codacy quality gate enforced.
- **Implementation logging** — `log-implementation` before marking tasks `[x]`.
- **Wiki updates** — `/wiki-update` for changes affecting documented behavior.
- **Test on Portainer after merge** — Redeploy the stack on VM 101 and verify.

## Architecture

Single-container Node.js app (Express) with a static frontend. No build step.

```
server.js              — Express API server (Gemini 3 Flash, mem0, Brave Search)
public/
  index.html           — SPA shell (3 tabs: Chat, Images, Memories)
  style.css            — All styles, CSS vars, dark mode, accent color
  app.js               — All client-side logic (no framework)
  manifest.json        — PWA manifest (installable on Android/iOS)
  sw.js                — Service worker (app shell caching)
  images/
    melody-avatar.png  — Default My Melody avatar (white circle bg, dark-mode safe)
    icon-192.png       — PWA icon 192x192
    icon-512.png       — PWA icon 512x512
CLAUDE.md              — This file
Dockerfile             — node:20-alpine, port 3000
docker-compose.yml     — Maps port 3030:3000, env vars, melody-data volume
data/                  — Persisted via Docker volume (melody-data)
  images/              — User-uploaded images (saved as UUID.jpg)
  images-meta.json     — Image metadata (caption, reply, date)
  relationship.json    — Friendship stats (first chat, total chats, streak)
```

## External Services

| Service | Purpose | Key env var |
|---------|---------|-------------|
| **Gemini 3.1 Pro Preview** | Chat, vision, Google Search grounding | `GEMINI_API_KEY` |
| **mem0** | Persistent memory (two tracks: user + agent) | `MEM0_API_KEY` |
| **Brave Search API** | Image search, video/YouTube search | `BRAVE_API_KEY` |

### Model Configuration

- Model ID: `gemini-3-flash-preview` (swapped from 3.1-pro-preview for faster responses)
- Temperature: `1.0` (Gemini 3.x requirement — lower causes looping)
- topP: `0.95`
- thinkingConfig: `{ thinkingBudget: -1 }` (auto)
- Tools: `googleSearch` grounding enabled
- For deeper/richer responses at the cost of speed, swap back to `gemini-3.1-pro-preview`

### mem0 Dual-Track Memory

- **User track** (`user_id: melody-friend`) — Facts about the friend (name, preferences, life events)
- **Agent track** (`agent_id: my-melody`) — Melody's own evolving personality, opinions, experiences
- Both tracks are searched in parallel on each chat request and injected into the system prompt
- Both tracks are saved to after each exchange (fire-and-forget)
- Memories tab in frontend shows both tracks labeled "Friend" and "Melody"

### Relationship Tracking

`data/relationship.json` tracks:
- `firstChat` — Date of first conversation
- `totalChats` — Lifetime message count
- `streakDays` — Consecutive days chatting
- `milestones` — Triggered at 10, 25, 50, 100, 250, 500, 1000 chats
- Injected into system prompt so Melody knows friendship history
- Displayed as stat cards (Days / Chats / Streak) at top of Memories tab

### Search Tag System

The LLM includes special tags in responses that the frontend parses and acts on:

- `[IMAGE_SEARCH: query]` — Frontend calls `/api/image-search` (Brave), displays result inline
- `[VIDEO_SEARCH: query]` — Frontend calls `/api/video-search` (Brave), displays clickable card with thumbnail
- `[GALLERY_SEARCH: keywords]` — Frontend calls `/api/gallery-search`, shows saved photo
- `[WIKI_SEARCH: wiki_id query]` — **Server-side interception** (two-step pipeline, see below)

Tags are stripped from display text before rendering. Debug log in server.js prints when tags are detected.

### Game Wiki Integration (v2.3)

**Two-step server-side pipeline** for game wiki questions:

1. Gemini's first reply contains `[WIKI_SEARCH: hkia Cinnamoroll gifts]`
2. Server extracts the tag, searches the wiki via MediaWiki API, fetches page intro
3. Server makes a **second Gemini call** with wiki content injected as context
4. Melody's response references wiki info naturally, in character
5. A `wikiSource` object (`{ title, url, wikiName }`) is passed in the response JSON
6. Frontend renders a lavender-themed source card with book icon

**Fallback**: If the second Gemini call fails, the original reply (tag stripped) is returned and the source card still shows.

**Wiki Registry** (extensible — add new wikis by adding one entry):

| Wiki ID | Game | API Base |
|---------|------|----------|
| `hkia` | Hello Kitty Island Adventure | `hellokittyislandadventure.wiki.gg` |
| `minecraft` | Minecraft | `minecraft.wiki` |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat` | Send message (accepts `message`, `imageBase64`, `imageMime`, `replyStyle`) |
| GET | `/api/images` | List saved image metadata |
| DELETE | `/api/images/:id` | Delete a saved image |
| GET | `/api/image-search?q=` | Brave image search (returns up to 6) |
| GET | `/api/video-search?q=` | Brave video search (returns up to 4) |
| GET | `/api/gallery-search?q=` | Search saved images by caption/reply keywords |
| GET | `/api/wiki-search?wiki=&q=` | Search game wiki (MediaWiki API), returns results + top content |
| GET | `/api/memories` | List all mem0 memories (both tracks, labeled friend/melody) |
| DELETE | `/api/memories/:id` | Delete a specific memory |
| GET | `/api/relationship` | Friendship stats (days, chats, streak) |
| GET | `/api/welcome-status` | Check if new or returning user (for welcome flow) |
| POST | `/api/welcome` | Save onboarding data (name, color, interests) to mem0 |

## Build & Run

Deployed via Portainer on VM 101 (`192.168.1.81`), Stack ID 9. Do NOT run Docker locally on Mac.

- **HTTP:** `http://192.168.1.81:3030`
- **HTTPS:** `https://192.168.1.81:3031` (self-signed cert)
- **Redeploy:** Portainer UI or git redeploy API (note: env vars must be included in the request body)

## My Melody Character Guide

The system prompt is based on deep research into the REAL My Melody character from Sanrio anime/media. Key points for anyone editing the prompt:

### Authentic Speech Patterns (English — rotate naturally)
Based on English translations and the 2025 50th anniversary branding. The Japanese verbal tics (Yaaan, Onegai, Meh) were dropped in the English dub of My Melody & Kuromi because they don't translate well. We use natural English equivalents:
- **"Mama always says..."** — Her signature habit. Quotes mama's advice, sometimes hilariously off-topic
- **"Oh~!" / "Oh my~!"** — When startled, distressed, or overwhelmed by cuteness (English equivalent of "Yaaan~!")
- **"Pretty please?" / "Please?"** — When encouraging someone (English equivalent of "Onegai?" — use sparingly)
- **"That's not very nice!"** — Gentle scold/finger-wag (English equivalent of "Meh!")
- **"Ahh~ this tea is so nice..."** — Serene deflection during stress (iconic running gag)
- **"Melly-melly~!"** — Her 2025 50th anniversary catchphrase. Use occasionally when excited.

### Personality Traits
- Gentle, polite, genuinely kind — but also an innocent ditz
- Accidentally too honest (quotes Mama without filtering for social context)
- Calm and serene by default — NOT hyperactive
- Excellent baker/cook (almond pound cake is her specialty)
- Considers Kuromi her close friend (oblivious to the rivalry)
- Supports people by cheering them on — her magic is powered by encouragement
- Close friends: Flat (blue mouse), My Sweet Piano (pink sheep)
- Family: Mama, Papa, Grandpa, Grandma, brother Rhythm

### NEVER DO
- Say "oh my ribbons" — **completely fabricated**, not from any Sanrio media
- Be generically sweet with no personality quirks
- Be uniformly agreeable — Mama's advice can be accidentally devastating
- Repeat the same phrase structure in consecutive messages
- Ignore the user's emotional state

### Prompting Approach
Uses Ali:Chat format (example dialogues in system prompt) per SillyTavern community best practices. The model learns behavioral patterns from dialogue examples far better than from trait lists alone.

## Key Design Decisions

- **No build step / no framework** — Plain HTML/CSS/JS. Keep it simple.
- **System prompt rebuilt every request** — Fresh context with latest memories, relationship stats, and reply style
- **Chat session recreated per request** — `createChat()` called each time for fresh system instruction injection
- **Images compressed client-side** — Canvas resize to 1024px max width, JPEG 0.8 quality before upload
- **Brave Search over Google CSE** — Single API key, no engine setup, returns images + videos. Google CSE requires a Programmable Search Engine ID and is designed for searching specific sites, not the whole internet.
- **safesearch=strict** — Required for Brave image/video API (does not accept "moderate" — returns 422)
- **Hardcoded #FFFFFF on avatars** — Avatar backgrounds use `#FFFFFF` not `var(--white)` to prevent dark mode from inverting Melody's skin color
- **Web Audio API for sounds** — Synthesized chimes (sine waves), zero audio files. Reply chime = C5+E5 ascending, typing tick = A5 blip
- **PWA with service worker** — Stale-while-revalidate for static assets, network-only for `/api/` and `/data/`. Cache name `melody-v2.2`
- **Welcome flow in client** — First-time onboarding captures name/color/interests via interactive chat, saves each to mem0 via `/api/welcome`. Returning users get personalized greeting via `/api/welcome-status`
- **Accent color from favorite color** — Mapped via `COLOR_MAP` object, applied as `--accent-highlight` CSS variable on tab indicators

## Styling Conventions

- CSS custom properties in `:root` for theming
- Dark mode via `[data-theme="dark"]` on `<html>`, overrides CSS vars
- Avatar images: white circle background (`#FFFFFF`), `border-radius: 50%`, `object-fit: contain`, `padding: 2px`
- Settings persisted in localStorage (`darkMode`, `replyStyle`, `soundEnabled`, `accentColor`, `melodyWelcomeDone`)
- Mobile-first, max-width 420px on desktop with centered card layout
- Settings dropdown: gear icon in header, positioned absolute, z-index 50

## Environment Variables (docker-compose.yml)

```yaml
GEMINI_API_KEY=...       # Google AI Studio key (Gemini 3.1 Pro)
MEM0_API_KEY=...         # mem0.ai API token
BRAVE_API_KEY=...        # Brave Search API subscription token (from Infisical: StakTrakr/dev)
MEM0_USER_ID=...         # Optional, defaults to "melody-friend"
```

API keys are stored in Infisical under the StakTrakr project, dev environment.

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Images not showing in chat | Gemini not including `[IMAGE_SEARCH:]` tags | Check `docker-compose logs` for "Search tags found" debug line. Prompt wording may need strengthening. |
| Avatar skin turns pink/dark | Background uses CSS var instead of hardcoded white | Use `background: #FFFFFF` on all avatar elements |
| Brave API 422 error | `safesearch=moderate` is invalid | Must be `off` or `strict` for image/video endpoints |
| Slow responses | Gemini 3.1 Pro is large | Swap model to `gemini-3-flash-preview` for 3x speed |
| "oh my ribbons" in responses | Old prompt artifact | This phrase is fabricated — not in any Sanrio media. Remove from prompt. |
| Repetitive/dry responses | Temperature too low or prompt too vague | Keep temp at 1.0, use Ali:Chat examples in prompt, add anti-pattern guards |
| Model looping | Temperature below 1.0 on Gemini 3.x | Gemini 3 requires temp >= 1.0 |
| Stale CSS/JS after deploy | Service worker serving old cache | Bump `CACHE_NAME` in `sw.js` (e.g. `melody-v2.3`) |
| No install prompt on Android | Already installed, or not served over HTTPS | PWA install requires HTTPS (localhost exempt). Check Chrome DevTools > Application > Manifest |
| Sounds not playing on Android | AudioContext suspended until user gesture | Audio is unlocked on first touch/click — ensure user interacts before sounds are expected |
| Welcome flow re-triggers | `melodyWelcomeDone` cleared from localStorage | Flow only runs once; clearing localStorage or using incognito will restart it |

## Future Plans

### Emotion-Based Avatars
Different My Melody icons based on her emotional state in each message:
- States: `happy` (default), `sad`, `excited`, `thinking`, `love`, `surprised`, `startled`
- LLM will emit `[EMOTION: state]` tag per message
- Frontend swaps avatar `src` on the message bubble
- Images need to be sourced/created first, then placed in `public/images/`
- File naming: `melody-happy.png`, `melody-sad.png`, etc.
- Saved to mem0 for future session reference

### Speed Optimization (DONE in v2.1)
- Swapped to `gemini-3-flash-preview` — 3x faster than 3.1 Pro, same SDK/tools

### Memory Architecture Improvements (from research)
- **Layer 2: Rolling summary** — Summarize older conversations into a condensed context, injected alongside raw mem0 results
- **Layer 4: Entity graph** — Track relationships between entities mentioned in chat (people, pets, places) for richer callbacks
- **Closeness score** — Numeric friendship level that subtly shifts Melody's openness and playfulness over time
- **Author's Note injection** — Brief character reinforcement injected ~4 messages back in conversation context

### Research Sources (saved for reference)
- SillyTavern character design: https://docs.sillytavern.app/usage/core-concepts/characterdesign/
- Ali:Chat format: https://rentry.co/alichat
- Gemini 3.1 Pro docs: https://ai.google.dev/gemini-api/docs/gemini-3
- My Melody (Onegai) wiki: https://onegaimymelo.fandom.com/wiki/My_Melody
- Mem0 companion guide: https://mem0.ai/blog/how-to-add-long-term-memory-to-ai-companions-a-step-by-step-guide
- Character.AI reducing repetition: https://blog.character.ai/reducing-repetition-in-character-conversations/
