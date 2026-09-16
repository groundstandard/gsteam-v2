// service-worker.js — CABT v1 PWA worker.
//
// Strategy:
//   - HTML navigation: NETWORK-FIRST with cache fallback (so users always get
//     the latest shell when online; falls back to cache when offline). Fixes
//     Bobby 2026-05-05: "When I save a new version to my desktop it does not
//     show the updates. It keeps going back to the older version."
//   - JSX / icons / manifest: cache-first, fall back to network
//   - Supabase API + OAuth + ESM CDN: bypass entirely
//   - On a new build, VERSION changes → old cache is purged on activate
//
// Bump VERSION on every deploy that ships frontend changes — the browser only
// re-installs the SW (and re-fetches the SHELL precache) when this string
// differs from the previously-installed copy.

const VERSION = '1789588521';
const CACHE   = `cabt-${VERSION}`;

// Files known at install time. Other same-origin requests are cached on first hit.
// Includes all JSX modules + Supabase bundle so first-time-offline doesn't break.
const SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/supabase.min.js',
  '/src/formula-explanations.js',
  '/src/tweaks-panel.jsx',
  '/src/ios-frame.jsx',
  '/src/data.jsx',
  '/src/api.jsx',
  '/src/calc.jsx',
  '/src/ui.jsx',
  '/src/ca-app.jsx',
  '/src/ca-detail.jsx',
  '/src/ca-forms.jsx',
  '/src/ca-scorecard.jsx',
  '/src/sales-app.jsx',
  '/src/admin-app.jsx',
  '/src/admin-extra.jsx',
  '/src/admin-queues.jsx',
  '/src/calls-board.jsx',
  '/src/reporting.jsx',
  '/src/assistant.jsx',
  '/src/auth-gate.jsx',
  '/src/app-shell.jsx',
];

// Hostnames we never cache — always go to network.
const BYPASS = [
  'supabase.co',
  'supabase.in',
  'googleapis.com',
  'accounts.google.com',
  'gstatic.com',
  'esm.sh',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  // Use individual cache.add() calls so one 404 doesn't kill the whole install.
  // (cache.addAll is atomic — a single missing file fails everything.)
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] precache miss:', url, err.message);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Always-network domains
  if (BYPASS.some((host) => url.hostname.endsWith(host))) return;

  // Only handle same-origin GETs
  if (url.origin !== self.location.origin) return;

  // Paths the server has to answer itself: the OAuth consent screen, the MCP
  // endpoint, and discovery. The navigation rule below hands every same-origin
  // navigation the app shell, which is right for the app's own routes and wrong
  // here — Claude's sign-in page came back as the React shell, which renders
  // nothing for that path. A blank screen, and a connector that can never
  // finish connecting.
  if (url.pathname.startsWith('/api/')
      || url.pathname === '/mcp'
      || url.pathname.startsWith('/.well-known/')) {
    return;
  }

  // CRITICAL: /config.js holds Supabase credentials injected at build time
  // by Vercel. NEVER cache it — if env vars change in Vercel and we cached
  // an old empty config.js, the PWA gets stuck on "Verifying session"
  // because Supabase init fails. Always fetch from network with no-cache.
  if (url.pathname === '/config.js') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() =>
        // Last-ditch fallback: if network is down, return an empty config so
        // the app at least gets to the offline screen instead of crashing.
        new Response(
          'window.CABT_CONFIG = window.CABT_CONFIG || { SUPABASE_URL: "", SUPABASE_ANON_KEY: "" };',
          { headers: { 'Content-Type': 'application/javascript' } }
        )
      )
    );
    return;
  }

  // Navigation requests are NETWORK-FIRST: try fresh /index.html with a short
  // timeout, fall back to cache only if the network is slow or offline. This
  // is the fix for Bobby's "stale PWA after deploy" issue — the old cache-
  // first behavior would always serve the previous shell, with a background
  // refresh that only mattered on the NEXT page load (so users effectively
  // saw last-deploy's HTML every time until they reloaded again).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // 4-second timeout on the network attempt — long enough for a real
        // load on a flaky connection, short enough to fall back gracefully.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const fresh = await fetch('/index.html', { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          // Update cache so offline still works with the latest shell.
          const copy = fresh.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return fresh;
        }
        throw new Error('non-200 navigation response');
      } catch (_e) {
        // Network unavailable / timed out — serve the cached shell, or the
        // offline page if we don't have one yet.
        const cached = await caches.match('/index.html');
        if (cached) return cached;
        const off = await caches.match('/offline.html');
        return off || new Response('<h1>Offline</h1>', {
          headers: { 'Content-Type': 'text/html' }, status: 503,
        });
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache successful, complete responses
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => {
        throw new Error('Offline and no cached response');
      });
    })
  );
});

// Allow the page to trigger a hard refresh by posting {type: 'SKIP_WAITING'}
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push (Chrome / Firefox / Edge — requires VAPID public key on server) ──
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_e) {
    payload = { title: 'gsTeam', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'gsTeam';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'gsteam',
    data: payload.data || { url: '/' },
    requireInteraction: !!payload.requireInteraction,
    actions: payload.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // Otherwise open a new one
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
