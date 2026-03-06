# My Melody Chat Wiki

> **Version:** 2.5.0 | **Last updated:** 2026-02-27 | **Pages:** 20
>
> Technical documentation for the My Melody Chat companion app — a Sanrio-themed AI chatbot with persistent memory, image vision, web search, game wiki integration, and a growing friendship system.

---

## Quick Start

```bash
docker-compose down && docker-compose up --build -d
# App runs at http://localhost:3030
```

See [Docker Deployment](docker-deployment.md) for full setup instructions.

---

## Page Index

### Architecture

| Page | Contents |
|------|----------|
| [Architecture Overview](architecture-overview.md) | System diagram, service map, data flow, port config, design decisions |
| [API Reference](api-reference.md) | All 12 endpoints with request/response shapes and examples |
| [Docker Deployment](docker-deployment.md) | Dockerfile, docker-compose, volumes, HTTPS, environment variables |
| [Data Persistence](data-persistence.md) | Server files, Docker volume, localStorage, sessionStorage, mem0 cloud |

### AI and Memory

| Page | Contents |
|------|----------|
| [Gemini Integration](gemini-integration.md) | Model config, chat pipeline, vision, Google Search grounding |
| [mem0 Memory System](mem0-memory-system.md) | Dual-track architecture, per-user isolation, search/save flows |
| [System Prompt](system-prompt.md) | Prompt structure, static/dynamic components, Ali:Chat format |
| [Conversation Buffer](conversation-buffer.md) | Session-based sliding window, in-memory Map, cleanup |

### Features

| Page | Contents |
|------|----------|
| [Search Tag System](search-tag-system.md) | All 5 tags, regex patterns, server vs client processing |
| [Wiki Integration](wiki-integration.md) | Two-step pipeline, MediaWiki API, wiki registry, fallbacks |
| [Brave Search](brave-search.md) | Image/video search, gallery search, safesearch config |
| [Reaction GIFs](reaction-gifs.md) | 10 emotions, nekos.best API, async rendering |

### Character and Social

| Page | Contents |
|------|----------|
| [Character Guide](character-guide.md) | My Melody personality, speech patterns, family, anti-patterns |
| [Sanrio Universe](sanrio-universe.md) | 46 character profiles, context injection, extensibility |
| [Relationship Tracking](relationship-tracking.md) | Friendship stats, milestones, streaks, per-user data |
| [Welcome Flow](welcome-flow.md) | Onboarding sequence, returning user greeting, color mapping |
| [User Identity](user-identity.md) | Multi-user support, per-user mem0 isolation, guest behavior |

### Frontend

| Page | Contents |
|------|----------|
| [Client Architecture](client-architecture.md) | Vanilla JS SPA, modules, event handling, image compression |
| [PWA and Service Worker](pwa-service-worker.md) | Manifest, caching strategy, install prompt, offline behavior |
| [Styling and Theming](styling-theming.md) | CSS variables, dark mode, accent colors, mobile-first layout |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 (Alpine) |
| **Server** | Express 4.21 |
| **AI Model** | Gemini 3 Flash Preview (`@google/genai`) |
| **Memory** | mem0 cloud API (dual-track) |
| **Search** | Brave Search API (images + videos) |
| **Wiki** | MediaWiki API (Hello Kitty Island Adventure, Minecraft) |
| **Frontend** | Vanilla HTML/CSS/JS (no framework, no build step) |
| **Deploy** | Docker + docker-compose, named volume |
| **PWA** | Service worker, manifest.json, stale-while-revalidate |

---

## External Services

| Service | Purpose | Env Var |
|---------|---------|---------|
| Gemini 3 Flash Preview | Chat generation, vision, Google Search grounding | `GEMINI_API_KEY` |
| mem0 | Persistent memory (user + agent tracks) | `MEM0_API_KEY` |
| Brave Search | Image and video search | `BRAVE_API_KEY` |
| MediaWiki (wiki.gg, minecraft.wiki) | Game wiki content | Public endpoints |
| nekos.best | Reaction GIF source | Public endpoint |

---

## Serving This Wiki

This wiki uses [Docsify](https://docsify.js.org/) for rendering. To serve locally:

```bash
# Install docsify-cli (one-time)
npm i -g docsify-cli

# Serve the docs folder
docsify serve docs

# Opens at http://localhost:3000
```

Or enable GitHub Pages pointing to the `docs/` folder in repository settings.
