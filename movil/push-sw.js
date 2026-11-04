/* Avisos push del Worker (worker/avisos.js). Copiado de LogisticS/sw.js; el SW que genera
   vite-plugin-pwa lo importa (importScripts en vite.config.js).
   Safari revoca el permiso si un push no muestra notificación: se muestra SIEMPRE, aunque el
   contenido no se pueda leer. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'BPA Plus', {
    body: d.body || 'Tienes vencimientos por revisar.', tag: d.tag, icon: 'pwa-192.png', data: { url: d.url || '#/' },
  }));
});

/* Tocar el aviso: si la app está abierta, la enfoca y cambia de ruta sin recargar (recargar pediría
   el PIN otra vez); si no, la abre. Solo ventanas de la app móvil: la web vive en el mismo sitio. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ruta = e.notification.data?.url || '#/';
  const base = new URL(self.registration.scope).pathname;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => new URL(c.url).pathname.startsWith(base));
    if (w) { w.postMessage({ ir: ruta }); return w.focus(); }
    return self.clients.openWindow('./' + ruta);
  }));
});
