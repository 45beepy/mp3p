const CACHE_NAME = 'drivestream-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    // Strategy: Cache First, Network Fallback (for UI speed)
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
