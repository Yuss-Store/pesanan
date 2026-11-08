const CACHE_NAME = 'ordermon-v1';
const CACHE_ASSETS = [
'./',
'./index.html',
'./style.css',
'./script.js',
'./manifest.json',
'./logo.jpg',
'./logo1.jpg'
];

self.addEventListener('install', function(event) {
self.skipWaiting();
event.waitUntil(
caches.open(CACHE_NAME).then(function(cache) {
return cache.addAll(CACHE_ASSETS).catch(function(err) {
console.log('Cache addAll partial failure:', err);
});
})
);
});

self.addEventListener('activate', function(event) {
event.waitUntil(
caches.keys().then(function(keys) {
return Promise.all(
keys.filter(function(k) { return k !== CACHE_NAME; })
.map(function(k) { return caches.delete(k); })
);
}).then(function() {
return self.clients.claim();
})
);
});

self.addEventListener('fetch', function(event) {
if (event.request.method !== 'GET') return;

const url = new URL(event.request.url);

if (url.hostname.includes('vercel.app') ||
url.hostname.includes('catbox.moe') ||
url.hostname.includes('cdn.jsdelivr.net') ||
url.hostname.includes('fonts.googleapis.com') ||
url.hostname.includes('fonts.gstatic.com')) {
event.respondWith(
fetch(event.request).catch(function() {
return caches.match(event.request);
})
);
return;
}

event.respondWith(
caches.match(event.request).then(function(cached) {
const networkFetch = fetch(event.request).then(function(response) {
if (response && response.status === 200 && response.type === 'basic') {
const clone = response.clone();
caches.open(CACHE_NAME).then(function(cache) {
cache.put(event.request, clone);
});
}
return response;
}).catch(function() {
return cached;
});
return cached || networkFetch;
})
);
});

self.addEventListener('message', function(event) {
if (event.data && event.data.type === 'SKIP_WAITING') {
self.skipWaiting();
}
});