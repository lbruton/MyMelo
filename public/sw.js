/**
 * @file My Melody Chat — Service worker for PWA caching.
 *
 * Update architecture (never requires manual cache busting):
 *
 * 1. sw.js registered with updateViaCache:'none' — browser always fetches
 *    sw.js from network, never HTTP cache. Any byte change triggers install.
 * 2. install: pre-caches APP_SHELL with versioned URLs (?v=VERSION),
 *    then skipWaiting() to activate immediately.
 * 3. activate: deletes ALL old caches, then clients.claim() to take control.
 * 4. fetch (navigate): network-first — always gets fresh index.html from server.
 *    Cache is offline-only fallback.
 * 5. fetch (assets): network-first with cache fallback. NOT stale-while-revalidate.
 *    This means every load fetches fresh assets from the server. The cache only
 *    serves when offline. This trades a few ms of latency for guaranteed freshness.
 * 6. index.html has a version gate <script> that fetches /api/version (bypasses SW)
 *    and hard-reloads if the version mismatches. Belt-and-suspenders.
 *
 * To deploy an update: bump VERSION here + APP_VERSION in server.js + ?v= params
 * in index.html. That's it. Every client self-updates within 1 page load.
 */

const VERSION = '3.12.0';
const CACHE_NAME = `melody-v${VERSION}`;

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

// Install: pre-cache app shell, activate immediately
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

// Activate: delete ALL old caches, take control immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

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
