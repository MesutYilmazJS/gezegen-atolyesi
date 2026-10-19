// Gezegen Atölyesi service worker: bir kez açıldıktan sonra internetsiz çalışma.
// Strateji: önce önbellek, arka planda güncelle (stale-while-revalidate).
const CACHE = 'gezegen-atolyesi-v1';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
  '/models/moon_a.glb', '/models/moon_b.glb', '/models/moon_c.glb', '/models/asteroid.glb',
  '/draco/draco_decoder.wasm', '/draco/draco_wasm_wrapper.js', '/draco/draco_decoder.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Sayfa, ilk ziyarette yüklediği dosyaların listesini gönderir
self.addEventListener('message', (event) => {
  if (event.data?.type === 'cache' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((u) => typeof u === 'string' && u.startsWith(self.location.origin));
    caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {}))));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  const isPage = req.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(isPage ? '/' : req, { ignoreSearch: isPage });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(isPage ? '/' : req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
