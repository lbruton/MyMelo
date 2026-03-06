# PWA & Service Worker

> **Last verified:** 2026-03-06
> **Source files:** `public/sw.js`, `public/manifest.json`, `public/index.html` (registration), `public/app.js` (install prompt)
> **Known gaps:** None

---

## Overview

My Melody Chat is a Progressive Web App installable on Android, iOS (Add to Home Screen), and desktop Chrome. The PWA layer consists of a web app manifest, a service worker with app shell caching, and a client-side install prompt banner.

## Manifest Configuration

File: `public/manifest.json`

```json
{
  "name": "My Melody Chat",
  "short_name": "Melody",
  "description": "Your Sweet Sanrio Friend",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#FF69B4",
  "background_color": "#FFF0F5",
  "icons": [
    {
      "src": "/images/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/images/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

| Property | Value | Notes |
|----------|-------|-------|
| `name` | My Melody Chat | Full app name (splash screen, app drawer) |
| `short_name` | Melody | Home screen label |
| `display` | standalone | No browser chrome, native app feel |
| `orientation` | portrait | Lock to portrait mode |
| `theme_color` | `#FF69B4` | Status bar color on Android, title bar on desktop |
| `background_color` | `#FFF0F5` | Splash screen background (pale pink) |
| `start_url` | `/` | Entry point when launched from home screen |

### Icons

Two icons provided, both with `purpose: "any maskable"`:

| Size | File | Usage |
|------|------|-------|
| 192x192 | `/images/icon-192.png` | Android adaptive icon, favicon, Apple touch icon |
| 512x512 | `/images/icon-512.png` | Splash screen, Play Store listing |

The `<link rel="icon">` and `<link rel="apple-touch-icon">` in `index.html` both point to `icon-192.png`.

### HTML Meta Tags

```html
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#FF69B4">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/images/icon-192.png">
<link rel="apple-touch-icon" href="/images/icon-192.png">
```

## Service Worker Registration

Registration is done inline in `index.html`, not in `app.js`:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
</script>
```

- Feature-detected via `'serviceWorker' in navigator`
- Registration errors are silently caught (non-critical for app function)
- The service worker file is served from the root (`/sw.js`)

## Cache Strategy

File: `public/sw.js`

### Cache Name

```js
const CACHE_NAME = 'melody-v2.6.0';
```

Format: `melody-vMAJOR.MINOR.PATCH`. Bump this value on every deploy to invalidate stale assets.

### App Shell (Pre-cached on Install)

```js
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/images/melody-avatar.png',
  '/images/kuromi-avatar.png',
  '/images/retsuko-avatar.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];
```

These 10 resources are cached during the `install` event before the service worker activates. The Kuromi and Retsuko character avatars were added in v2.6.0 alongside multi-character support.

### Strategy by Route Type

| Route Pattern | Strategy | Rationale |
|---------------|----------|-----------|
| `/api/*` | Network-only | API responses must be fresh (chat, memories, search) |
| `/data/*` | Network-only | User-uploaded images must be current |
| Everything else | Stale-while-revalidate | Serve cached immediately, update in background |

### Stale-While-Revalidate Flow

```
Request arrives
  ├── Check cache for match
  │   ├── HIT: return cached response immediately
  │   │         └── Background: fetch from network → update cache
  │   └── MISS: await network fetch → cache response → return
  └── Network fails + cache exists: return stale cached copy
```

```js
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only: skip respondWith entirely, let browser handle
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    return;
  }

  // Stale-while-revalidate for everything else
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
```

Key detail for network-only routes: the handler calls `return` without invoking `e.respondWith()`, which causes the browser to perform a normal network fetch as if no service worker existed.

## Install Lifecycle

### Install Event

```
install → open cache → addAll(APP_SHELL) → skipWaiting()
```

`skipWaiting()` forces the new service worker to activate immediately without waiting for all existing clients (tabs) to close. This means users get the latest cached assets on the next navigation.

### Activate Event

```
activate → enumerate cache keys → delete any key !== CACHE_NAME → clients.claim()
```

`clients.claim()` makes the newly activated service worker take control of all open clients immediately, rather than waiting for the next navigation.

### Cache Invalidation on Deploy

1. Bump `CACHE_NAME` in `sw.js` (e.g., `melody-v2.5.1` to `melody-v2.6.0`)
2. Deploy updated `sw.js`
3. Browser detects byte-level change in service worker file
4. New service worker installs, pre-caches new app shell
5. `skipWaiting()` activates it immediately
6. Activate event deletes all old caches (keys that do not match new `CACHE_NAME`)
7. `clients.claim()` takes over existing tabs

## Install Prompt Handling

Implemented in `app.js`:

```js
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                           // Suppress browser's default prompt
  deferredInstallPrompt = e;                     // Store the event
  if (sessionStorage.getItem('installDismissed')) return;
  showInstallBanner();                           // Show custom banner
});
```

The custom install banner:

```
┌─────────────────────────────────────────────────────┐
│ Add My Melody to your home screen!  [Install] [x]   │
└─────────────────────────────────────────────────────┘
```

- Positioned fixed, `bottom: 70px`, centered with `translateX(-50%)`
- Pink gradient background matching the app header
- z-index: 60 (above tab bar, below lightbox)
- Animated in with `slide-up` keyframe (0.4s ease-out)
- **Install button:** Calls `deferredInstallPrompt.prompt()` and awaits `userChoice`
- **Dismiss button:** Sets `sessionStorage('installDismissed')` to suppress for the session
- Only one banner can exist at a time (checked via `.install-banner` selector)

## HTTPS Requirement

PWA installation requires HTTPS. The exception is `localhost`, which is treated as a secure context by browsers for development purposes.

| Environment | Protocol | Install Prompt |
|-------------|----------|----------------|
| Production | HTTPS | Available |
| `localhost` | HTTP | Available (secure context exemption) |
| Non-localhost HTTP | HTTP | Not available |

## Offline Behavior

With the service worker active:

| Resource | Offline Behavior |
|----------|-----------------|
| App shell (HTML, CSS, JS, icons) | Served from cache -- app loads fully |
| Chat API (`/api/chat`) | Fails -- error message shown in chat ("I couldn't reach the server...") |
| Memory/gallery APIs | Fails -- empty state message shown |
| Image search/video search | Fails silently -- no media appended to message |
| Previously cached static assets | Served from stale cache |

The app shell loads offline, but all interactive features (chat, memories, gallery) require a network connection because API routes use network-only strategy.

## Update Flow

```
Browser detects updated sw.js (byte-level diff)
  → New SW enters "installing" state
  → install event: pre-cache new APP_SHELL
  → skipWaiting(): skip waiting, activate immediately
  → activate event: delete old caches (key !== CACHE_NAME)
  → clients.claim(): take over all open tabs
  → Next fetch: stale-while-revalidate serves new cached assets
```

Users do not need to close tabs or refresh. The combination of `skipWaiting()` and `clients.claim()` ensures the update takes effect immediately. New cached assets will be served on subsequent navigations or fetch requests.

---

## Related Pages

- [Client Architecture](client-architecture.md) - SPA structure, install banner implementation
- [Styling & Theming](styling-theming.md) - Install banner styles, z-index layering
