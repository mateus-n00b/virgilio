/* Virgílio — service worker mínimo (habilita a instalação como app).
 * Privacidade: NÃO guarda respostas da API nem páginas com dados pessoais. Só a página "sem conexão"
 * e os ícones ficam em cache; todo o resto vai sempre à rede. */
const CACHE = "vg-shell-v1";
const SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Só navegações (abrir uma tela): se a rede falhar, mostra a página "sem conexão"
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});

// ---------------- Web Push: lembretes de prova de vida e alertas aos Virgílios ----------------
// O servidor envia { title, body, url, tag } cifrado; só este navegador decifra.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Virgílio", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Virgílio", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag, // o mesmo assunto não empilha avisos
      renotify: !!data.tag,
      data: { url: data.url || "/" },
      // Alertas sobre quem você protege ficam na tela até você tocar (não somem sozinhos)
      requireInteraction: (data.url || "").startsWith("/protegidos"),
      vibrate: (data.url || "").startsWith("/protegidos") ? [300, 120, 300, 120, 300] : [120, 60, 120],
    }),
  );
});

// Toque na notificação: foca uma janela já aberta do app (ou abre uma) na tela do aviso
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin));
      if (win) return win.focus().then(() => win.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
