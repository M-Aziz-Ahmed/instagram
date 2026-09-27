// Service Worker for PWA
// Bump this whenever the caching strategy changes so old caches get purged on activate.
// NOTE: Do not cache HTML/RSC payloads or API responses — after a new deploy they can
// reference a mixed set of hashed chunks, which breaks module init order (TDZ errors).
const CACHE_NAME = 'anontweet-static-v2';
const OFFLINE_URL = '/offline.html';

// Install event - cache essential offline assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled([
          cache.add('/offline.html'),
          cache.add('/manifest.json'),
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

// ── Client visibility ────────────────────────────────────────────
//
// Which clients are in front of the user, tracked per client id.
//
// This replaces a heartbeat: the page used to `setInterval` a ping every 5s and
// the worker treated a 45s silence as "the app is closed". Background-tab timer
// throttling, a sleeping laptop, or any long task stalled that interval, so the
// worker started raising OS notifications for someone who was looking straight
// at the app — and it could never recover until the next ping landed.
//
// Visibility is now pushed on every real transition (see app/providers.jsx),
// keyed by client id, so it is correct the instant it is reported and immune to
// timer throttling. Ids belonging to windows that have since closed are pruned
// against `clients.matchAll` below, which is what stops a client that vanished
// without reporting "hidden" from suppressing notifications forever.
const visibleClientIds = new Set();

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type !== 'app_visibility') return;

  const clientId = event.source && event.source.id;
  if (!clientId) return;

  if (data.visible) visibleClientIds.add(clientId);
  else visibleClientIds.delete(clientId);
});

async function isAppVisible() {
  let windows = [];
  try {
    windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch {
    return false;
  }

  // No window at all means the app is genuinely closed — always notify.
  if (!windows.length) return false;

  const live = new Set(windows.map((c) => c.id));
  for (const id of visibleClientIds) {
    if (!live.has(id)) visibleClientIds.delete(id);
  }

  if (windows.some((c) => c.focused)) return true;
  if (visibleClientIds.size > 0) return true;
  // `visibilityState` is a Chrome/Firefox extension and is absent on Safari, so
  // this is a bonus signal, never the only one.
  return windows.some((c) => c.visibilityState === 'visible');
}

// Push notification - only show when no client is actually in front of the user
self.addEventListener('push', (event) => {
  let data = { title: 'AnonTweet', body: '', url: '/', icon: '/icon-192.png' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil((async () => {
    if (await isAppVisible()) return;

    const options = {
      body:  data.body,
      icon:  data.icon  || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      // `type` and `callId` are carried through deliberately. The old handler
      // stored only `{ url }`, so the page could not tell a call from a DM and
      // the notification had no way to offer accept/decline.
      data:  { url: data.url || '/', type: data.type || '', callId: data.callId || '' },
      tag:   data.tag, // same tag as the page-side notification = no duplicates
      vibrate: [100, 50, 100],
    };

    if (data.type === 'call_incoming') {
      // A ringing call should not be dismissible by a stray click, and should
      // re-alert if the same call is delivered again. `renotify` is only legal
      // alongside `tag`, so the two are set together.
      options.actions = [
        { action: 'accept', title: 'Accept' },
        { action: 'reject', title: 'Decline' },
      ];
      options.requireInteraction = true;
      if (options.tag) options.renotify = true;
    }

    return self.registration.showNotification(data.title, options);
  })());
});

/**
 * Put the app in front of the user at `url`.
 *
 * Prefers handing the navigation to an already-open page so it routes
 * client-side. The previous version called `client.navigate(url)` on the first
 * same-origin window it found and returned, which meant a hard document load
 * that destroyed the React tree — so a call opened from its own notification
 * arrived with no ringing UI — and it picked an arbitrary window when several
 * were open. `navigate()` also rejects on clients that do not support it, and
 * with no catch the rejection was swallowed and the `openWindow` fallback below
 * never ran, leaving a click that did nothing at all.
 */
async function focusOrOpen(url) {
  let windows = [];
  try {
    windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  } catch {}

  const sameOrigin = windows.filter((c) => {
    try { return new URL(c.url).origin === self.location.origin; }
    catch { return false; }
  });

  if (sameOrigin.length) {
    sameOrigin.forEach((c) => {
      try { c.postMessage({ type: 'navigate', url }); } catch {}
    });

    // Bring the window forward. `focus()` rejects on some clients, so a failure
    // has to fall through to a real navigation rather than being swallowed.
    for (const c of sameOrigin) {
      try { await c.focus(); return; } catch {}
    }
    try { await sameOrigin[0].navigate(url); return; } catch {}
  }

  if (self.clients.openWindow) {
    try { await self.clients.openWindow(url); return; } catch {}
  }
}

// Notification click - focus the app and route to the notification's target
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(focusOrOpen(url));
});

// Notification action buttons.
//
// The split here is forced by what each half of answering a call needs:
//   • Decline is a pure server-side signal, so the worker can do it with a
//     plain authenticated same-origin fetch, and it works with the app closed.
//   • Accept cannot be done here. getUserMedia and the socket.io signalling
//     channel do not exist in a worker, so Accept surfaces the app instead and
//     the page answers the call for real. That is also what puts the in-app
//     accept/decline buttons in front of the user, which is where the media
//     permission prompt belongs.
//
// Action buttons are a desktop/PWA capability. iOS Safari does not render
// actions for web push, so on iOS both buttons collapse to the plain
// notification body, which still takes the user to the ringing call.
self.addEventListener('notificationaction', (event) => {
  const data = event.notification.data || {};
  const action = event.action;
  event.notification.close();

  if (action === 'reject' && data.callId) {
    event.waitUntil(declineCall(data.callId));
    return;
  }
  event.waitUntil(focusOrOpen(data.url || '/'));
});

async function declineCall(callId) {
  try {
    // Same-origin, so the browser attaches the `af_session` cookie and this
    // needs no token of its own. See routes/calls.js.
    await fetch(`/api/calls/${encodeURIComponent(callId)}/decline`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // A failed decline leaves the call ringing, which is the safe direction:
    // the caller keeps seeing the incoming call rather than a silent drop.
  }
}

// Fetch event - network first, fallback to cache for immutable assets only
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Only cache GET requests (Cache API does not support POST/PATCH/etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  const { pathname } = new URL(event.request.url);
  // Only content-addressed/immutable assets may be persisted. Everything else
  // (HTML, RSC payloads, API data) must stay network-only to avoid stale graphs.
  const isCacheable =
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icon-') ||
    pathname === '/manifest.json' ||
    pathname === OFFLINE_URL;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isCacheable && response && response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseToCache))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // If no cache and navigation request, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL).then((offline) => offline || new Response('Offline', { status: 503, statusText: 'Offline' }));
          }
          return new Response('Not found', { status: 404, statusText: 'Not Found' });
        });
      })
  );
});
