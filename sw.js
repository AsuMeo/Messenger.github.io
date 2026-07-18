const CACHE_NAME = 'meow-v1';
const STATIC_ASSETS = [
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lottie.js/5.12.2/lottie.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  const isStatic = STATIC_ASSETS.some(u => url.includes(u.replace('./',''))) || url.endsWith('.html') || url.endsWith('.js') || url.endsWith('.css');
  if (isStatic) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return resp;
        });
      })
    );
  } else {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener('sync', e => {
  if (e.tag === 'send-message') {
    e.waitUntil(notifyClientsToSend());
  }
});

async function notifyClientsToSend() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'SEND_QUEUED_MESSAGES' });
  }
}
