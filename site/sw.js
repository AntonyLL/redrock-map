/* Offline support: app files are served from cache and refreshed in the background;
   map tiles and photos are served from the data cache filled by the in-page downloader. */
const SHELL = 'rr-shell-v3';
const DATA = 'rr-data-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.json', 'icon-180.png', 'icon-512.png', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css'];
const DATA_HOSTS = ['server.arcgisonline.com', 'basemap.nationalmap.gov', 's3.amazonaws.com', 'mountainproject.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (DATA_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(req.url, { ignoreVary: true });
      if (hit) return hit;
      try {
        const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
        if (r.ok) c.put(req.url, r.clone());
        return r;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    }));
    return;
  }
  if (url.origin === location.origin) {
    // Fresh copy when the network answers within 2.5 s, otherwise the saved copy (no signal in the park).
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(req, r.clone()); return r.ok ? r : null; }).catch(() => null);
      if (!hit) return (await net) || new Response('离线，且这个文件还没有保存。', { status: 504 });
      e.waitUntil(net);
      const fresh = await Promise.race([net, new Promise(res => setTimeout(() => res(null), 2500))]);
      return fresh || hit;
    }));
  }
});
