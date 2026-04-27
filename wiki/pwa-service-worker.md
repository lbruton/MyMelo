# PWA & Service Worker

> **Last verified:** 2026-04-27
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

| Property           | Value          | Notes                                             |
| ------------------ | -------------- | ------------------------------------------------- |
| `name`             | My Melody Chat | Full app name (splash screen, app drawer)         |
| `short_name`       | Melody         | Home screen label                                 |
| `display`          | standalone     | No browser chrome, native app feel                |
| `orientation`      | portrait       | Lock to portrait mode                             |
| `theme_color`      | `#FF69B4`      | Status bar color on Android, title bar on desktop |
| `background_color` | `#FFF0F5`      | Splash screen background (pale pink)              |
| `start_url`        | `/`            | Entry point when launched from home screen        |

### Icons

Two icons provided, both with `purpose: "any maskable"`:

| Size    | File                   | Usage                                            |
| ------- | ---------------------- | ------------------------------------------------ |
| 192x192 | `/images/icon-192.png` | Android adaptive icon, favicon, Apple touch icon |
| 512x512 | `/images/icon-512.png` | Splash screen, Play Store listing                |

The `<link rel="icon">` and `<link rel="apple-touch-icon">` in `index.html` both point to `icon-192.png`.

### HTML Meta Tags

```html
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#FF69B4" />
<link rel="manifest" href="/manifest.json" />
<link rel="icon" href="/images/icon-192.png" />
<link rel="apple-touch-icon" href="/images/icon-192.png" />
```

## Service Worker Registration

Registration is done inline at the bottom of `index.html`, not in `app.js`:

```html
<script>
  // Service Worker registration — updateViaCache:'none' forces network fetch of sw.js
  // on every navigation so cache version bumps propagate immediately
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Check for updates on every page load
        reg.update().catch(() => {});
        // When a new SW is waiting, tell it to activate immediately
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (newSW) {
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'activated') {
                window.location.reload();
              }
            });
          }
        });
      })
      .catch(() => {});
  }
</script>
```

- Feature-detected via `'serviceWorker' in navigator`
- Registered with `{ updateViaCache: 'none' }` — the browser always fetches `sw.js` from the network, never the HTTP cache, so any byte-level change triggers SW installation immediately
- `reg.update()` is called on every page load to poll for SW updates even between navigations
- When a new SW activates, the page reloads automatically to pick up fresh assets
- Registration errors are silently caught (non-critical for app function)
- The service worker file is served from the root (`/sw.js`)

## Cache Strategy

File: `public/sw.js`

### Cache Name

```js
const VERSION = '3.12.0';
const CACHE_NAME = `melody-v${VERSION}`;
```

Format: `` `melody-v${VERSION}` `` — the cache name is derived from the same `VERSION` constant used for the app shell URLs. Currently resolves to `melody-v3.12.0`. Bumping `VERSION` on every deploy automatically changes the cache name, which causes the activate event to delete all old caches.

### App Shell (Pre-cached on Install)

```js
const APP_SHELL = [
  '/',
  '/index.html',
  `/style.css?v=${VERSION}`,
  `/app.js?v=${VERSION}`,
  '/manifest.json',
  '/images/melody-avatar.png',
  '/images/kuromi-avatar.png',
  '/images/retsuko-avatar.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
];
```

These 10 resources are cached during the `install` event before the service worker activates. The `?v=` query params on `style.css` and `app.js` match the `?v=` params used in the `<link>` and `<script>` tags in `index.html`, which bust Chrome's HTTP disk cache independently of the service worker. The Kuromi and Retsuko character avatars were added in v2.6.0 alongside multi-character support.

### Strategy by Route Type

| Route Pattern   | Strategy                                  | Rationale                                                          |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `/api/*`        | Network-only                              | API responses must be fresh; version gate depends on this          |
| `/data/*`       | Network-only                              | User-uploaded images must be current                               |
| Everything else | Network-first (cache as offline fallback) | Guaranteed freshness on every load; cache only serves when offline |

### Network-First Flow

```
Request arrives
  ├── /api/* or /data/*: pass through (no respondWith) → browser fetches normally
  └── Everything else:
      ├── Attempt network fetch
      │   ├── SUCCESS: update cache with fresh response → return response
      │   └── FAIL (offline): return cached copy if available
      └── No cached copy available offline: request fails
```

```js
// Fetch: network-first for everything. Cache is offline-only fallback.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only for API calls and user data (no caching ever)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    return;
  }

  // Network-first for all static assets — cache is offline fallback only
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request)),
  );
});
```

Key detail for network-only routes: the handler calls `return` without invoking `e.respondWith()`, which causes the browser to perform a normal network fetch as if no service worker existed. This is what allows the `<head>` version gate to reliably reach `/api/version` even while the service worker is active.

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

Every deploy requires bumping the version string in exactly three places:

| File                | Location                    | Example                                                             |
| ------------------- | --------------------------- | ------------------------------------------------------------------- |
| `server.js`         | `APP_VERSION` constant      | `const APP_VERSION = '3.12.0';`                                     |
| `public/sw.js`      | `VERSION` constant          | `const VERSION = '3.12.0';`                                         |
| `public/index.html` | Version gate + `?v=` params | `d.version !== '3.12.0'` + `app.js?v=3.12.0` + `style.css?v=3.12.0` |

What happens after deploy:

1. Bump `VERSION` in `sw.js` (e.g., `3.11.0` → `3.12.0`) — this changes `CACHE_NAME` to `melody-v3.12.0`
2. Deploy updated `sw.js`
3. Browser detects byte-level change in service worker file (enforced by `updateViaCache: 'none'`)
4. New service worker installs, pre-caches new app shell with versioned URLs
5. `skipWaiting()` activates it immediately
6. Activate event deletes all old caches (keys that do not match new `CACHE_NAME`)
7. `clients.claim()` takes over existing tabs

## Install Prompt Handling

Implemented in `app.js`:

```js
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Suppress browser's default prompt
  deferredInstallPrompt = e; // Store the event
  if (sessionStorage.getItem('installDismissed')) return;
  showInstallBanner(); // Show custom banner
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

| Environment        | Protocol | Install Prompt                       |
| ------------------ | -------- | ------------------------------------ |
| Production         | HTTPS    | Available                            |
| `localhost`        | HTTP     | Available (secure context exemption) |
| Non-localhost HTTP | HTTP     | Not available                        |

## Offline Behavior

With the service worker active:

| Resource                         | Offline Behavior                                                        |
| -------------------------------- | ----------------------------------------------------------------------- |
| App shell (HTML, CSS, JS, icons) | Served from cache (network-first fell back to cache) — app loads fully  |
| Chat API (`/api/chat`)           | Fails -- error message shown in chat ("I couldn't reach the server...") |
| Memory/gallery APIs              | Fails -- empty state message shown                                      |
| Image search/video search        | Fails silently -- no media appended to message                          |
| Previously cached static assets  | Served from cache (offline fallback only; never served when online)     |

The app shell loads offline, but all interactive features (chat, memories, gallery) require a network connection because API routes use network-only strategy.

## Update Flow

Two independent mechanisms ensure clients always run the latest version:

**Primary path — service worker byte diff:**

```
Browser fetches sw.js from network (updateViaCache:'none' prevents HTTP cache hit)
  → Byte-level change detected → new SW enters "installing" state
  → install event: pre-cache new APP_SHELL (versioned URLs)
  → skipWaiting(): activate immediately without waiting for tabs to close
  → activate event: delete all old caches (key !== new CACHE_NAME)
  → clients.claim(): take over all open tabs
  → updatefound handler in index.html: reloads the page when new SW activates
  → Next fetch: network-first fetches all assets fresh from server
```

**Belt-and-suspenders — version gate in `<head>` of `index.html`:**

```
Page loads → inline <script> fetches /api/version (network-only, bypasses SW)
  → Compare server version to hardcoded version string in HTML
  → Match: proceed normally
  → Mismatch: unregister all SWs → delete all caches → redirect with ?_cb= param
```

The version gate handles edge cases where the SW byte-diff path didn't fire (e.g., the user's browser had the old `index.html` cached at the HTTP layer before `updateViaCache:'none'` was adopted). Between the two mechanisms, every client self-updates within one page load — no user action required.

---

## Related Pages

- [Client Architecture](client-architecture.md) - SPA structure, install banner implementation
- [Styling & Theming](styling-theming.md) - Install banner styles, z-index layering
