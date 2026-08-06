/* eslint-disable no-restricted-globals */

// POMAR PWA service worker.
//
// react-scripts (webpack.config.js: `swSrc`) natively runs this file
// through workbox-webpack-plugin's InjectManifest during `npm run build`
// only — self.__WB_MANIFEST below gets replaced with the list of hashed
// build assets (JS/CSS/index.html) at that point. In dev (`npm start`)
// this file isn't built at all, which is why registration is gated to
// production in serviceWorkerRegistration.js.
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

clientsClaim();
self.skipWaiting();

const SHELL_CACHE = 'pomar-shell-v1';
const OFFLINE_URL = '/offline.html';

// ── App shell ────────────────────────────────────────────────────────────
// self.__WB_MANIFEST covers everything webpack itself emits (index.html,
// hashed JS/CSS). offline.html lives in public/ and is copied to build/ by
// react-scripts' own copy step *after* webpack runs, so it never reaches
// the compilation and has to be added by hand here.
precacheAndRoute([
  ...self.__WB_MANIFEST,
  { url: OFFLINE_URL, revision: '1' },
]);
cleanupOutdatedCaches();

// This app has no client-side router (App.js branches on
// window.location.pathname per top-level product, see App.js) — every
// route is the same index.html shell, so one navigation route covers all
// of them. Network-first so logged-in users always get a live shell when
// online; falls back to the cached shell, and if that's not cached yet
// (first-ever offline visit), to the static offline page.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async (params) => {
    try {
      return await new NetworkFirst({
        cacheName: SHELL_CACHE,
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }).handle(params);
    } catch (err) {
      const cache = await caches.open(SHELL_CACHE);
      return (
        (await cache.match(params.request)) ||
        (await caches.match(OFFLINE_URL)) ||
        Response.error()
      );
    }
  }
);

// ── API calls: cache-then-network ───────────────────────────────────────
// Only GET is ever registered as a route below, so POST/PUT/PATCH/DELETE
// (anything that mutates data) are never matched here and fall straight
// through to the network untouched — Workbox only intercepts requests a
// registerRoute matcher claims.
//
// Backend lives on a different origin from the frontend (FastAPI on
// Render, frontend on Vercel — see REACT_APP_API_URL), so this matches by
// path rather than same-origin.
const isApiGet = ({ request, url }) =>
  request.method === 'GET' && url.pathname.startsWith('/api/');

registerRoute(
  isApiGet,
  new StaleWhileRevalidate({
    cacheName: 'pomar-api-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
);
// Note on "cache-then-network": StaleWhileRevalidate serves the cached
// response immediately when present, and updates the cache from the
// network in the background for next time. It does not push that fresh
// data into an already-rendered screen — this app has no shared
// data-fetching layer (each module calls fetch() directly), so live-
// refreshing an open screen the instant the network responds would mean
// wiring a listener into every module individually. Out of scope here;
// flagged in the PR notes.

// ── Static public assets (images/fonts) ─────────────────────────────────
// Not covered by the webpack-built precache manifest above (same reason
// offline.html isn't — react-scripts copies public/ after webpack runs),
// but caching them still makes repeat visits feel instant.
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    (request.destination === 'image' ||
      request.destination === 'font' ||
      url.origin === 'https://fonts.gstatic.com' ||
      url.origin === 'https://fonts.googleapis.com'),
  new CacheFirst({
    cacheName: 'pomar-static-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);
