// Keeps a copy of display.html on the computer that runs the display (for example the EasyWorship computer),
// so pressing refresh shows the page at once instead of a white screen, even on a slow or dropped connection.
// The copy is refreshed in the background every time the page loads with internet, so updates appear on the next reload.
// Only the display page is stored. Verses always come live from the relay and are never cached here.

const CACHE = "verse-display-v1";
const PAGE = "/display.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(PAGE, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const isDisplay = req.mode === "navigate" && url.origin === self.location.origin && /^\/display(\.html)?$/.test(url.pathname);
  if (!isDisplay) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(PAGE);
      const fresh = fetch(PAGE, { cache: "no-cache" })
        .then(async (r) => {
          if (r && r.ok) {
            // a response that came through a redirect cannot be used to answer a page load, so store a plain copy
            const copy = r.redirected ? new Response(await r.clone().blob(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }) : r.clone();
            await cache.put(PAGE, copy);
          }
          return r;
        })
        .catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }                 // show the saved copy now, update it in the background
      const r = await fresh;                                              // first visit: nothing saved yet
      return r || new Response("Display could not load. Check the internet connection and reload.", { status: 503, headers: { "Content-Type": "text/plain" } });
    })
  );
});
