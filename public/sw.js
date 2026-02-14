const MANIFEST_URL = '/.vite/manifest.json';
const CACHE_NAME = 'app-cache-v1';

let manifestData = null;
let precacheFiles = [];

async function loadManifest() {
    if (manifestData) return manifestData;
    const resp = await fetch(MANIFEST_URL, { cache: 'no-store' });
    manifestData = await resp.json();


    precacheFiles = Object.values(manifestData).flatMap((entry) => {
        const arr = [];
        if (entry.file) arr.push('/' + entry.file);
        if (entry.css) arr.push(...entry.css.map((x) => '/' + x));
        if (entry.assets) arr.push(...entry.assets.map((x) => '/' + x));
        return arr;
    });

    precacheFiles.push('/icons/apple-touch-icon.png');
    precacheFiles.push('/icons/favicon-96x96.png');
    precacheFiles.push('/icons/favicon.ico');
    precacheFiles.push('/icons/favicon.svg');
    precacheFiles.push('/icons/web-app-manifest-192x192.png');
    precacheFiles.push('/icons/web-app-manifest-512x512.png');
    precacheFiles.push('/icons/texture_icons.png');
    precacheFiles.push('/icons/texture_overlays.png');
    precacheFiles.push('/index.html');

    return manifestData;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        loadManifest().then(() =>
            caches.open(CACHE_NAME).then((cache) => cache.addAll(precacheFiles))
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            await loadManifest();
            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();

            for (const request of keys) {
                const url = new URL(request.url);
                const path = url.pathname;


                if (!precacheFiles.includes(path)) {
                    await cache.delete(request);
                }
            }

            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const path = url.pathname;

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);


            const cached = await cache.match(event.request);
            if (cached) {

                if (precacheFiles.includes(path)) {
                    updateInBackground(event.request);
                }
                return cached;
            }


            try {
                const response = await fetch(event.request);

                if (response.ok && response.type === 'basic') {
                    cache.put(event.request, response.clone());
                }
                return response;
            } catch {
                return cached || new Response('', { status: 500 });
            }
        })()
    );
});

async function updateInBackground(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
            await cache.put(request, response.clone());
        }
    } catch { }
}
