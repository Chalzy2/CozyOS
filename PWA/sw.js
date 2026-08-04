const CACHE_VERSION = 'cozyos-v1.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Core structural assets to cache immediately
const ASSETS_TO_CACHE = [
  '/dashboard.html',
  '/identity.html',
  '/parcel.html',
  '/mobility.html',
  '/ai.html',
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
        // Offline structural fallback validation for navigation transitions
        if (event.request.mode === 'navigate') {
          return caches.match('/dashboard.html');
        }
      });
    })
  );
});
          
