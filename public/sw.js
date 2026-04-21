// Service worker minimal pour Runly.
// Stratégie : network-first (l'app est petite, on privilégie la fraîcheur),
// avec fallback cache pour le mode hors-ligne.

const CACHE_NAME = "runly-v1";
const OFFLINE_CORE = ["/", "/manifest.json", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_CORE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // On ne gère que les GET same-origin (pas les tuiles OSM, pas POST, etc.)
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Met en cache les réponses valides pour l'offline
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/"))
      )
  );
});

// ---------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------
// Reçoit un événement push envoyé par le backend (via web-push) et affiche
// une notification système, même si l'app est fermée.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Runly", body: event.data?.text?.() || "Nouvelle notification" };
  }
  const title = data.title || "Runly";
  const options = {
    body: data.body || "",
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    tag: data.tag || "runly-notification",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur une notif → ouvre l'app ou focus l'onglet existant
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
