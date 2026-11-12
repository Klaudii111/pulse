/* PULSE Signals service worker.
 * - App shell: precached, cache-first (versioned cache, old versions removed on activate)
 * - ./data/*.json: network-first with cache fallback (offline shows last data)
 * - Web push: shows notification from JSON payload {title, body, url, tag}
 * Bump VERSION on every deploy that changes shell files.
 */
const VERSION = 'pulse-v1.15.3';
const SHELL = `${VERSION}-shell`;
const DATA = 'pulse-data';
const IMG = 'pulse-img'; /* 1.15.0: illustrations, stale-while-revalidate (kept across versions) */

const SHELL_FILES = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './css/app.css',
  './css/skin.css',
  './css/v1151.css',
  './css/v1153.css',
  './css/v1154.css',
  './css/v1155.css',
  './js/app.js',
  './js/ui.js',
  './js/format.js',
  './js/store.js',
  './js/domain.js',
  './js/charts.js',
  './js/pwa.js',
  './js/sha256.js',
  './js/lessons.js',
  './js/views/home.js',
  './js/views/signals.js',
  './js/views/detail.js',
  './js/views/calc.js',
  './js/views/results.js',
  './js/views/more.js',
  './js/views/extra.js',
  './js/motion.js',
  './js/live.js',
  './js/explain.js',
  './js/instruments.js',
  './js/wallet.js',
  './js/sync.js',
  './js/qr.js',
  './js/views/paper.js',
  './js/views/terminal.js',
  './js/views/pages.js',
  './js/feed.js',
  './js/onboarding.js',
  './js/share.js',
  './js/views/events.js',
  './js/views/moje.js',
  './js/i18n/index.js',
  './js/i18n/cs.js',
  './js/i18n/en.js',
  './js/i18n/cs19.js',
  './js/i18n/en19.js',
  './js/i18n/cs110.js',
  './js/i18n/en110.js',
  './js/i18n/cs111.js',
  './js/i18n/cs112.js',
  './js/i18n/en112.js',
  './js/i18n/en111.js',
  './js/health.js',
  './js/views/learn.js',
  './js/brief.js',
  './js/styles.js',
  './js/styles_data.js',
  './js/bars.js',
  './js/market.js',
  './js/tour.js',
  './js/views/help.js',
  './js/community.js',
  './js/views/penezenka.js',
  './js/i18n/cs113.js',
  './js/i18n/en113.js',
  './js/i18n/cs114.js',
  './js/i18n/cs115.js',
  './js/i18n/en115.js',
  './js/i18n/cs116.js',
  './js/i18n/en116.js',
  './js/i18n/cs117.js',
  './js/i18n/en117.js',
  './js/i18n/cs118.js',
  './js/i18n/en118.js',
  './js/i18n/cs119.js',
  './js/i18n/en119.js',
  './js/i18n/cs120.js',
  './js/i18n/en120.js',
  './js/i18n/cs121.js',
  './js/i18n/en121.js',
  './js/i18n/en114.js',
  './js/i18n/cs1139.js',
  './js/i18n/en1139.js',
  './js/i18n/cs1150.js',
  './js/i18n/cs1151.js',
  './js/i18n/en1151.js',
  './js/alloc.js',
  './js/den.js',
  './js/i18n/en1150.js',
  './js/i18n/cs1152.js',
  './js/i18n/en1152.js',
  './js/i18n/cs1153.js',
  './js/i18n/en1153.js',
  './js/i18n/cs1154.js',
  './js/i18n/en1154.js',
  './js/i18n/cs1155.js',
  './js/i18n/en1155.js',
  './js/portfolio.js',
  './js/views/portfolio.js',
  './fonts/archivo-latin.woff2',
  './fonts/archivo-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/badge-96.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './icons/mark-64.png',
  './icons/mark-128.png',
  /* 1.15.0: only the illustrations of the first screen (Dnes); the rest -> runtime cache IMG below */
  './img/il/05_svickovy_graf.webp',
  './img/il/13_puls_sipka.webp',
  './img/il/02_robot.webp',
  './img/il/08_cekani.webp',
  /* the app background (Noční tyrkys, AB) – there right after the update and offline */
  './img/bg/bg-phone.webp',
  './img/bg/bg-desktop.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('pulse-v') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  /* 1.9.0: live price stream (Server-Sent Events) and other API calls never go through the cache */
  if (url.pathname.includes('/api/') || (req.headers.get('accept') || '').includes('text/event-stream')) return;

  // Data: network-first
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(req));
    return;
  }
  // 1.15.0 illustrations: stale-while-revalidate (shell precache first, so the 4 first-screen ones never wait)
  if (url.pathname.includes('/img/')) {
    event.respondWith(staleWhileRevalidate(req, event));
    return;
  }
  // Navigations: serve cached shell when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }
  // Shell assets: cache-first, then network (and cache it)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

async function staleWhileRevalidate(req, event) {
  const pre = await caches.match(req, { ignoreSearch: true, cacheName: SHELL });
  if (pre) return pre;
  const cache = await caches.open(IMG);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  const key = new URL(req.url); key.search = '';
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) await cache.put(key.href, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key.href);
    if (!hit) throw err;
    // Mark the response so the UI can say the data is from cache
    const headers = new Headers(hit.headers);
    headers.set('X-Pulse-From-Cache', '1');
    const body = await hit.blob();
    return new Response(body, { status: 200, statusText: 'OK (cache)', headers });
  }
}

/* ---------- Web push ---------- */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'PULSE';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'pulse',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    data: { url: data.url || './#/dnes', signal: data.signal_id || data.id || null },
    /* 1.9.1: a new signal comes with [Zainvestovat] [Zobrazit] (actions from the payload) */
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2).map((a) => ({ action: String(a.action || ''), title: String(a.title || '') })) : [],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  /* 'invest' -> the signal detail with the investment sheet already open; 'open' / tap -> the signal (or the url) */
  let url = d.url || './';
  if (d.signal && event.action === 'invest') url = `./#/signaly?s=${encodeURIComponent(d.signal)}&invest=1`;
  else if (d.signal && event.action === 'open') url = `./#/signaly?s=${encodeURIComponent(d.signal)}`;
  const target = new URL(url, self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.navigate ? c.navigate(target) : c.postMessage({ type: 'NAVIGATE', url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
