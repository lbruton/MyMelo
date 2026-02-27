/**
 * @file My Melody Chat — Service worker for PWA caching.
 *
 * Implements app shell caching with stale-while-revalidate for static assets
 * and network-only for API and data routes. Cache versioning uses melody-vX.Y format.
 *
 * @version 2.4.0
 */

/**
 * Cache version identifier. Bump on each deploy to invalidate stale assets.
 * Format: melody-vMAJOR.MINOR (e.g., melody-v2.3).
 * @type {string}
 */
const CACHE_NAME = 'melody-v2.4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/images/melody-avatar.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

/**
 * Handles the install event -- pre-caches the app shell.
 *
 * Opens the versioned cache, adds all {@link APP_SHELL} URLs, then calls
 * {@link ServiceWorkerGlobalScope.skipWaiting skipWaiting} so the new
 * service worker activates immediately without waiting for existing clients
 * to close.
 *
 * @listens InstallEvent
 */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/**
 * Handles the activate event -- purges outdated caches.
 *
 * Iterates all cache keys and deletes any that do not match the current
 * {@link CACHE_NAME}, then calls {@link Clients.claim claim} so this
 * service worker takes control of all open clients immediately.
 *
 * @listens ExtendableEvent
 */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/**
 * Handles the fetch event -- routes requests by path prefix.
 *
 * - `/api/*` and `/data/*` requests are **network-only** (the handler returns
 *   without calling {@link FetchEvent.respondWith respondWith}, so the browser
 *   performs a normal network fetch).
 * - All other requests use **stale-while-revalidate**: the cached response is
 *   returned immediately if available while a network fetch runs in the
 *   background to update the cache. If no cached response exists, the network
 *   response is awaited. If the network fetch fails, the stale cached copy is
 *   used as a fallback.
 *
 * @listens FetchEvent
 */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only for API calls and user data
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    return;
  }

  // Stale-while-revalidate for static assets
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
