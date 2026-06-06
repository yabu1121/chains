// Chains service worker. Two jobs:
//  1. Satisfy the PWA installability requirement (a fetch handler must exist).
//  2. Give the installed app a usable offline shell instead of the browser's
//     dinosaur — navigations fall back to a cached offline page.
//
// Strategy is deliberately conservative because the app is auth- and data-heavy:
//  - API calls (/api/*) are never cached — always hit the network so we never
//    serve a stale or wrong-user response from cache.
//  - Same-origin static assets (icons, fonts, _next build output) use
//    stale-while-revalidate: instant from cache, refreshed in the background.
//  - Navigations are network-first, falling back to the offline page when down.

const VERSION = "chains-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone
  if (url.pathname.startsWith("/api/")) return; // never cache API responses

  // Navigations: network-first, offline page as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { ignoreSearch: true }),
      ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
