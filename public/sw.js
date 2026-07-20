// Service Worker for PWA
const CACHE_NAME = 'anonfeed-v5';
const OFFLINE_URL = '/offline.html';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/offline.html',
        '/manifest.json',
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Client-reported visibility, with timestamp
let _lastVisibleReport = 0;
const STALE_MS = 45000; // if no report in 45s, assume app is closed

self.addEventListener('message', (event) => {
  if (event.data?.type === 'app_visibility') {
    if (event.data.visible) {
      _lastVisibleReport = Date.now();
    } else {
      _lastVisibleReport = 0;
    }
  }
  // Heartbeat ping from client — means client is alive and visible
  if (event.data?.type === 'heartbeat') {
    _lastVisibleReport = Date.now();
  }
});

// Push notification — only show when app is NOT visible
self.addEventListener('push', (event) => {
  let data = { title: 'AnonTweet', body: '', url: '/', icon: '/icon-192.svg' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil(isAppVisible().then((visible) => {
    if (visible) return;

    return self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon  || '/icon-192.svg',
      badge: data.badge || '/icon-192.svg',
      data:  { url: data.url || '/' },
      vibrate: [100, 50, 100],
    });
  }));
});

async function isAppVisible() {
  // 1. Check if client reported visible recently
  if (_lastVisibleReport > 0 && (Date.now() - _lastVisibleReport) < STALE_MS) {
    return true;
  }

  // 2. Check if any client window is actually focused
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    if (clients.some(c => c.focused)) return true;

    // 3. If no focused client, check if ANY client is visible (tab is foregrounded)
    if (clients.some(c => c.visibilityState === 'visible')) return true;
  } catch {}

  return false;
}

// Notification click — open or focus the relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Only cache GET requests (Cache API does not support POST/PATCH/etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          // If no cache and navigation request, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});
