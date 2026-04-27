# My Melody Chat v2.5

> See `~/.claude/CLAUDE.md` for global workflow rules (push safety, version checkout gate, PR lifecycle, MCP tools, code search tiers, UI design workflow, plugins).

A My Melody (Sanrio) companion chat app with persistent memory, image vision, web search, game wiki integration, a growing friendship system, PWA install, notification sounds, and a first-time welcome flow.

## DocVault — Project Documentation

Technical documentation lives in **DocVault** at `/Volumes/DATA/GitHub/DocVault/Projects/MyMelo/`. mem0 supplements with session context, past decisions, and operational notes. **Read DocVault pages and check mem0 before discussing architecture or planning changes.**

Key pages: Start at `/Volumes/DATA/GitHub/DocVault/Projects/MyMelo/_Index.md` and follow the index.

```
# Read a specific page
Read /Volumes/DATA/GitHub/DocVault/Projects/MyMelo/Overview.md

# Search MyMelo docs
Grep pattern="<topic>" path="/Volumes/DATA/GitHub/DocVault/Projects/MyMelo"
```

When making changes that affect documented behavior, run `/vault-update` before pushing.

## Branching & Workflow

- **`main`** — Protected via Codacy PR gate. Never push directly.
- **`fix/` or `feat/` branches** — Created from `main` for each change.
- Flow: feature branch → push → PR to `main` → Codacy → merge → redeploy via Portainer

### Project Workflow Overrides (vs global CLAUDE.md)


This project runs on Portainer (VM 101, `192.168.1.81`, Stack ID 9, port 3030) behind Nginx Proxy Manager at **https://mymelo.lbruton.cc** (Let's Encrypt wildcard via Cloudflare). These global rules are **relaxed**:


- **Use `main` branch only** — All PRs target `main` directly (no `dev` branch).
- **Version lock does not apply** — Skip `/release patch` and `/start-patch` commands for this project.
- **Worktrees are optional** — Use simple `git checkout -b fix/xxx` from `main` if preferred; worktrees are available but not required.
- **Perform manual testing on Portainer deployment** — Browserbase tests are not used for this project.
- **Use Portainer for deployment** — Skip deploy-verify checks; Fly.io is not used for this project.
- **Run Docker only on the VM** — Execute `docker-compose` on VM 101, not on Mac. The app runs on the VM exclusively.

### What DOES apply (non-negotiable)

- **Issue for every code change** — No cowboy coding. Prefix: `MELO` in Plane (see `issue` skill).
- **Spec-workflow for features** — Requirements → Design → Tasks → Implementation with dashboard approvals. Bug fixes with clear root cause may skip the spec.
- **PR gate** — All code reaches `main` via PR. Codacy quality gate enforced.
- **Implementation logging** — `log-implementation` before marking tasks `[x]`.
- **DocVault updates** — `/vault-update` for changes affecting documented behavior.
- **Test on Portainer after merge** — Redeploy the stack on VM 101 and verify.

## Architecture

Single-container Node.js app (Express) with a static frontend. No build step.

```
server.js              — Express API server (Gemini 3 Flash, mem0, Brave Search)
public/
  index.html           — SPA shell (5 tabs: Chat, Images, Memories, Journal, Videos)
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
  users.json           — Dynamic user profile store (email → profile mapping)
```

### User Identity via Cloudflare Access

All requests pass through Cloudflare Access, which sets the `Cf-Access-Authenticated-User-Email` header with the authenticated user's email address.

**Request flow:** Cloudflare Access → `Cf-Access-Authenticated-User-Email` header → `identifyUser` middleware → `req.userEmail` / `req.userProfile` → route handlers

The `identifyUser` middleware (applied to all `/api/*` routes) extracts the email from the Cloudflare header, falls back to the `DEFAULT_USER_EMAIL` env var (for LAN access without Cloudflare), and auto-creates a profile in `data/users.json` for new users. Every route handler uses `req.userEmail` as the canonical identity — the server ignores any client-sent userId.

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

- **User track** (`user_id: melody-friend-{emailSlug}`) — Per-user facts (name, preferences, life events). Email slug derived via `getEmailSlug(email)`
- **Agent track** (`agent_id: my-melody`) — Melody's own evolving personality, opinions, experiences (global, not per-user)
- Both tracks are searched in parallel on each chat request and injected into the system prompt
- Both tracks are saved to after each exchange (fire-and-forget)
- Memories tab in frontend shows both tracks labeled "Friend" and "Melody" (core memory + raw mem0 memories)
- Journal tab shows conversation summaries (daily digests extracted by the LLM)

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
| GET | `/api/me` | Current user profile + `needsOnboarding` flag (from Cloudflare identity) |
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
| POST | `/api/welcome` | Save onboarding data (name, color, interests) to mem0 + display name to user profile |

## Build & Run

Deployed via Portainer on VM 101 (`192.168.1.81`), Stack ID 9. Do NOT run Docker locally on Mac.

- **Public URL:** `https://mymelo.lbruton.cc` (via Nginx Proxy Manager + Let's Encrypt wildcard + Cloudflare DNS)
- **Direct HTTP:** `http://192.168.1.81:3030` (LAN only)
- **NPM config:** `mymelo.lbruton.cc` → `http://192.168.1.81:3030`, Force SSL, HTTP/2

- **Redeploy:** Portainer UI or git redeploy API (note: env vars must be included in the request body)

## PWA Update Architecture

**Every deploy MUST update the version string in exactly 3 places.** This is the ONLY thing needed to push updates to all clients — no manual cache busting, no user action required.

### Version bump checklist (all 3 required)

| File | Location | Example |
|------|----------|---------|
| `server.js` | `APP_VERSION` constant | `const APP_VERSION = '3.12.0';` |
| `public/sw.js` | `VERSION` constant | `const VERSION = '3.12.0';` |
| `public/index.html` | Version gate + `?v=` params | `d.version !== '3.12.0'` + `app.js?v=3.12.0` + `style.css?v=3.12.0` |

### How updates propagate (no user action needed)

1. **SW registration** uses `updateViaCache: 'none'` — browser always fetches `sw.js` from network
2. **New `sw.js`** has a different `VERSION` → byte-level mismatch → browser installs new SW
3. **New SW** calls `skipWaiting()` + `clients.claim()` → activates immediately, deletes old caches
4. **All fetch requests** are network-first — cache is offline-only fallback, never serves stale content
5. **Version gate** in `<head>` of `index.html` fetches `/api/version` (bypasses SW via `/api/` exclusion), compares to hardcoded version, and if mismatched: unregisters all SWs, clears all caches, hard-reloads
6. **`?v=` query params** on `app.js` and `style.css` bust Chrome's HTTP disk cache

### Design principles (always follow these)

- **Use network-first caching** for `index.html` and navigation requests (never use stale-while-revalidate)
- **Register `sw.js` with `updateViaCache: 'none'`** — always enable this setting
- **Add `?v=` query params** to all `app.js` and `style.css` references in HTML
- **Keep version strings synchronized** across all 3 files (server.js, public/sw.js, public/index.html)
- **Reserve cache for offline support only** — never use it for performance optimization
- **Route `/api/*` requests as network-only** — the version gate depends on this behavior

### Emergency: `/bust-cache` endpoint

If a client is stuck (should never happen with this architecture), visiting `https://mymelo.lbruton.cc/bust-cache` unregisters all SWs, deletes all caches, clears localStorage, and redirects to `/`. This is a server-rendered route — it bypasses the SW entirely.

## My Melody Character Guide

Character personality, speech patterns, and prompting approach are documented in DocVault `[[Character Guide]]`. Key rule: **exclude "oh my ribbons" from responses** — it's completely fabricated, not from any Sanrio media. Use Ali:Chat format for system prompt examples.

## Key Design Decisions

- **No build step / no framework** — Plain HTML/CSS/JS. Keep it simple.
- **System prompt rebuilt every request** — Fresh context with latest memories, relationship stats, and reply style
- **Chat session recreated per request** — `createChat()` called each time for fresh system instruction injection
- **Images compressed client-side** — Canvas resize to 1024px max width, JPEG 0.8 quality before upload
- **Brave Search over Google CSE** — Single API key, no engine setup, returns images + videos. Google CSE requires a Programmable Search Engine ID and is designed for searching specific sites, not the whole internet.
- **safesearch=strict** — Required for Brave image/video API (does not accept "moderate" — returns 422)
- **Hardcoded #FFFFFF on avatars** — Avatar backgrounds use `#FFFFFF` not `var(--white)` to prevent dark mode from inverting Melody's skin color
- **Web Audio API for sounds** — Synthesized chimes (sine waves), zero audio files. Reply chime = C5+E5 ascending, typing tick = A5 blip
- **PWA with service worker** — Network-first for all assets (cache is offline-only fallback), network-only for `/api/` and `/data/`. See "PWA Update Architecture" below
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
GEMINI_API_KEY=...                # Google AI Studio key (Gemini 3.1 Pro)
MEM0_API_KEY=...                  # mem0.ai API token
BRAVE_API_KEY=...                 # Brave Search API subscription token (from Infisical: StakTrakr/dev)
MEM0_USER_ID=...                  # Optional, backward-compat fallback for mem0 user_id (defaults to "melody-friend")
DEFAULT_USER_EMAIL=...            # Fallback email when Cloudflare header is absent (e.g., LAN access). Defaults to "owner@local"
MIGRATION_EMAIL_AMELIA=...        # Email address to migrate Amelia's legacy userId-based data to (one-time migration)
MIGRATION_EMAIL_LONNIE=...        # Email address to migrate Lonnie's legacy userId-based data to (one-time migration)
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
| Stale CSS/JS after deploy | Version mismatch | Bump version in 3 places (see PWA Update Architecture). Auto-corrects within 1 load. |
| No install prompt on Android | Already installed, or not served over HTTPS | PWA install requires HTTPS (localhost exempt). Check Chrome DevTools > Application > Manifest |
| Sounds not playing on Android | AudioContext suspended until user gesture | Audio is unlocked on first touch/click — ensure user interacts before sounds are expected |
| Welcome flow re-triggers | `melodyWelcomeDone` cleared from localStorage | Flow only runs once; clearing localStorage or using incognito will restart it |

## Issue Tracking

MyMelo issues use the `MELO-` prefix and are tracked in Plane: <https://plane.lbruton.cc/lbruton/projects/fe617d02-f7fe-4842-b2e9-ada78bf829b6/>.

Migrated from DocVault to Plane on 2026-04-27. Pre-migration issues (`MEL-` prefix, MEL-1..MEL-50) are archived at `DocVault/Archive/Issues-Pre-Plane/MyMelo/` — open issues at the cutover (`MEL-49`, `MEL-50`) were recreated as `MELO-1` and `MELO-2` with `Original ID:` references in their descriptions. Closed/done issues were not recreated; consult the archive for historical context.

New issues are created via `/issue` (which dispatches on `.specflow/config.json` `issue_backend`) or directly via `mcp__plane__create_issue`.

## Future Plans

Tracked as Plane issues (prefix `MELO`). Key planned features: emotion-based avatars, rolling summary memory, entity graph, closeness score.

## Hooks

- **gitleaks**: Pre-commit hook scans for accidental secret commits (`github-pat`, `aws`, `stripe`, etc.). Runs via `pre-commit` framework. Installed 2026-04-14 (OPS-116).
