// M366.8 — Emergency Bootstrap Recovery. Real fixes, no architecture
// change: (1) CACHE_VERSION bumped so any previously-installed copy of
// this worker (from an earlier deployment) recognizes a change on its
// next activate() and discards its old, stale cache entries via the
// existing, unmodified cleanup logic below - this worker was never
// versioned past v1.0.0 before, confirmed by reading the file's history
// in this repository. (2) Paths changed from absolute ('/dashboard.html')
// to relative ('dashboard.html') - absolute paths break under a GitHub
// Pages *project* page (username.github.io/reponame/), since they
// resolve against the domain root rather than the actual deployed
// subpath; relative paths resolve correctly under both a project page
// and a custom domain root, confirmed compatible with both. (3)
// index.html and login.html added to the real, existing precache list -
// they were the two most important navigation entry points and were
// previously absent from it entirely.
//
// RP-018 — real-phone investigation, this pass: CACHE_VERSION had been
// frozen at 'cozyos-M366.8' through roughly 20 subsequent milestones
// (M367-M388) without ever being bumped again. HONEST CORRECTION made
// during the same pass, before treating that as the fix: confirmed by
// repository-wide search that no code anywhere currently calls
// navigator.serviceWorker.register() - this worker is not actually
// being registered by index.html, login.html, or dashboard.html today,
// so its cache-first-for-assets fetch strategy cannot be intercepting
// live traffic under normal use. The real, load-bearing finding instead
// was that manifest.json's start_url ("/dashboard.html") sends any
// home-screen-installed PWA straight into dashboard.html, which (unlike
// index.html/login.html) carried no defensive unregister-stale-worker
// snippet - so a device with a genuinely pre-existing registration
// (from before M366.8 introduced that cleanup) could keep it alive
// indefinitely. That gap is now closed directly in dashboard.html; see
// its header comment. This version bump is kept only as harmless
// defense-in-depth for that same pre-existing-install case, not
// presented as the primary fix.
const CACHE_VERSION = 'cozyos-M388-RP018';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Core structural assets to cache immediately
const ASSETS_TO_CACHE = [
  'index.html',
  'login.html',
  'dashboard.html',
  'identity.html',
  'parcel.html',
  'mobility.html',
  'ai.html',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/feather-icons/4.29.0/feather.min.js'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clear previous engine caches automatically
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Strategy Interceptor Matrix
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // BYPASS: Let Firebase Authentication, Firestore WebSocket, Cloud Firestore APIs run natively
  if (
    url.hostname.includes('firebase') || 
    url.hostname.includes('firestore') || 
    event.request.method !== 'GET'
  ) {
    return; 
  }

  // STRATEGY: Network-first for programmatic web sub-pages or local mock APIs
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // STRATEGY: Network-first for HTML navigation requests. Entry-point
  // HTML (index.html, login.html, dashboard.html, etc.) must never be
  // served stale-first - a cached copy is only a fallback for genuine
  // offline use, never preferred over a fresh fetch. This is distinct
  // from the cache-first strategy below, which remains for static,
  // non-HTML assets (CSS/JS/images) where staleness is a smaller risk
  // and the existing background-refresh behavior already mitigates it.
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('index.html')))
    );
    return;
  }

  // STRATEGY: Cache-first fallback to stale-while-revalidate for localized design/shell items
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Trigger background refreshing update for static resources silently
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* No network connection */});
        
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Non-navigation fetch failure (e.g. an image or script) with
        // nothing cached - real, honest failure, not a fabricated
        // fallback. Navigation requests never reach here; they're
        // handled entirely by the network-first branch above.
      });
    })
  );
});
          
