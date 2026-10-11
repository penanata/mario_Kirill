const CACHE = "life-os-shell-1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/manifest.webmanifest", "/icon-192.png"])));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
