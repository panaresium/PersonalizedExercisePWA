const CACHE_NAME = "codex-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./icons/icon.svg",
  "./src/app.js",
  "./src/components/ui.js",
  "./src/lib/audio.js",
  "./src/lib/router.js",
  "./src/lib/state.js",
  "./src/lib/storage.js",
  "./src/lib/utils.js",
  "./src/lib/xml-parser.js",
  "./src/lib/zip-manager.js",
  "./src/views/dashboard.js",
  "./src/views/player.js",
  "./src/views/project-editor.js",
  "./src/views/projects-list.js",
  "./src/views/set-editor.js",
  "./src/views/settings.js",
  "./src/views/step-editor.js",
  "./src/views/beep-list.js",
  "./src/views/beep-editor.js",
  "https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // We wrap addAll in a Promise.allSettled or just addAll.
      // addAll fails if any request fails.
      // For CDNs, ensure they are reachable.
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // For navigation requests, we can fallback to index.html if we were using pushState,
  // but we are using hash router so ./ works.

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      // Network First / Stale While Revalidate logic could be applied,
      // but for "offline first" we usually try cache then network,
      // or if it's not in cache (like new media), fetch and cache.

      return fetch(request).then((response) => {
        // Cache new requests (e.g. dynamically loaded modules if any, or media)
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
          return response;
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, copy);
        });
        return response;
      });
    })
  );
});
