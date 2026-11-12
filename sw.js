/* Moonward service worker - makes the game playable offline.
   Game files: network first, so a new version shows up as soon as you are online,
   falling back to the cached copy when you are not.
   Fonts: cache first, since they never change. */
'use strict';
const CACHE = 'moonward-v1';
const SHELL = ['./', 'index.html', 'style.css', 'core.js', 'ui.js', 'icon.svg', 'manifest.webmanifest'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => put(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./')))
  );
});
