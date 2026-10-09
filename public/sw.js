/* ZenCrevia service worker.
   It makes the app installable, shows a small page when the network is gone, and shows the push
   notifications the server sends (server/push.js) while the app is closed. It never caches the app or its
   data: every page load goes to the network, so a deploy reaches everyone at once, and nothing anyone
   works on is kept on the device. Served with no-cache, so a new version of this file is picked up on the
   next visit. */
const OFFLINE_CACHE = "zc-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.addAll([OFFLINE_URL, "/pwa-icon/192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* page loads only: online they go straight to the network; offline, a page that says so. Everything else
   (the API, the live stream, files) is left to the browser untouched. */
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.mode !== "navigate" || r.method !== "GET") return;
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE_URL)));
});

/* Safari revokes a subscription whose pushes are not shown, so there every push is shown */
const APPLE = /iPhone|iPad|Macintosh/.test(self.navigator.userAgent) && /Safari/.test(self.navigator.userAgent) && !/Chrome|CriOS|Edg|Firefox|FxiOS/.test(self.navigator.userAgent);

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    /* someone looking at ZenCrevia already sees it there */
    if (!APPLE && list.some((c) => c.visibilityState === "visible" && c.focused)) return;
    return self.registration.showNotification(d.title || "ZenCrevia", {
      body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
      icon: "/pwa-icon/192.png", badge: "/icons/badge-72.png", data: { url: d.url || "/" },
    });
  }));
});

/* a click opens what it is about: in the window already open (no reload), or in a new one */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) { open.postMessage({ type: "zc-open", url }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});

/* the push service replaced the subscription: subscribe again and tell the server */
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil(fetch("/api/push/key", { credentials: "include" }).then((r) => r.json()).then((k) => {
    const s = k.publicKey.replace(/-/g, "+").replace(/_/g, "/"), raw = atob(s + "===".slice((s.length + 3) % 4)), key = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
    return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }).then((sub) => fetch("/api/push/subscribe", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) })).catch(() => {}));
});
