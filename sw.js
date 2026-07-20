const CACHE_NAME = 'meow-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './favicon-32x32.png',
  './apple-touch-icon.png',
  './screenshot-narrow.png',
  './screenshot-wide.png',
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

// Share Target: intercept POST and redirect to index.html with shared data
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Handle Web Share Target POST
  if (e.request.method === 'POST' && url.pathname.endsWith('index.html')) {
    e.respondWith(
      (async () => {
        const formData = await e.request.formData();
        const mediaFiles = formData.getAll('media');
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const link = formData.get('url') || '';

        // Convert files to simple objects for postMessage
        const fileInfos = [];
        for (const file of mediaFiles) {
          if (file && file.size) {
            const arr = await file.arrayBuffer();
            fileInfos.push({
              name: file.name,
              type: file.type,
              size: file.size,
              data: Array.from(new Uint8Array(arr))
            });
          }
        }

        // Store temporarily and notify all clients
        const payload = { type: 'SHARED_FILES', title, text, url: link, files: fileInfos };
        const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientsList) {
          client.postMessage(payload);
        }

        // Redirect to app so user sees the shared content
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./index.html');
        if (cached) return cached;
        return fetch('./index.html');
      })()
    );
    return;
  }

  // Normal GET handling
  if (e.request.method !== 'GET') return;

  const isStatic = STATIC_ASSETS.some(u => {
    const clean = u.replace('./', '');
    return url.href.includes(clean) || url.pathname.endsWith(clean);
  }) || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.json') || url.pathname.endsWith('.png');

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
      fetch(e.request).catch(() => caches.match('./index.html'))
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
