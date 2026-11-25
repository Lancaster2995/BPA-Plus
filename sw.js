/* ==========================================================================
   BPA-Plus — sw.js
   Service worker stale-while-revalidate: los archivos propios salen al instante
   de la caché y se actualizan por detrás para la próxima apertura. Un despliegue
   cambia CACHE, el SW nuevo precarga todo y recarga las ventanas abiertas.
   ========================================================================== */
var CACHE = 'bpa-plus-v84';
var ASSETS = [
  './', './index.html', './styles.css?v=57', './manifest.json',
  './js/config.js', './js/cloud.js', './js/auth.js', './js/domain.js?v=2', './js/db.js?v=34', './js/ui.js?v=6', './js/formatos.js?v=51', './js/actas.js?v=48', './js/retiro.js?v=44', './js/views.js?v=65', './js/lock.js?v=6', './js/drive.js?v=58', './js/alerts.js?v=3', './js/avisos.js?v=2', './js/app.js?v=49',
  './autoinspecciones/index.html', './autoinspecciones/main.js',
  './icons/icon-44.png?v=6', './icons/icon-192.png?v=6', './icons/icon-512.png?v=6', './icons/icon-maskable-512.png?v=6', './icons/apple-touch-icon.png?v=6'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    var viejas = keys.filter(function (k) { return k !== CACHE; });
    return Promise.all(viejas.map(function (k) { return caches.delete(k); }))
      .then(function () { return self.clients.claim(); })
      .then(function () {
        // Primera instalación: la página abierta ya es esta versión, recargarla solo demora.
        if (!viejas.length) return;
        /* Fuera de waitUntil: la recarga pasa por este SW, que no atiende nada hasta terminar
           de activarse. Esperarla adentro dejaba la página y todas sus peticiones colgadas. */
        self.clients.matchAll({ type: 'window' }).then(function (clients) {
          clients.forEach(function (client) { client.navigate(client.url).catch(function () {}); });
        });
      });
  }));
});

/* Avisos push del Worker (worker/avisos.js), como movil-app/public/push-sw.js. Se muestra SIEMPRE:
   un push sin notificación hace que el navegador retire el permiso. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'BPA Plus', {
    body: d.body || 'Tienes vencimientos por revisar.', tag: d.tag, icon: 'icons/icon-192.png?v=6', data: { url: d.url || '#/' }
  }));
});

/* Tocar el aviso: enfoca la web abierta y le pide abrir las alertas (sin recargar: recargar pediría el
   PIN); si no hay ninguna, la abre. Las ventanas de /movil/ son de la app móvil, que tiene su propio SW. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var ruta = (e.notification.data && e.notification.data.url) || '#/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
    var w = ws.filter(function (c) { return new URL(c.url).pathname.indexOf('/movil/') < 0; })[0];
    if (w) { w.postMessage({ ir: ruta }); return w.focus(); }
    return self.clients.openWindow('./' + ruta);
  }));
});

/* Solo el mismo origen: Firestore, Auth, Drive y las CDN van directo, sin pasar por acá. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res.status === 200) c.put(e.request, res.clone()).catch(function () {});
        return res;
      });
      if (!hit) return net;
      e.waitUntil(net.catch(function () {}));
      return hit;
    });
  }));
});
