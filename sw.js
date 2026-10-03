/* ==========================================================================
   BPA-Plus — sw.js
   Service worker stale-while-revalidate: los archivos propios salen al instante
   de la caché y se actualizan por detrás para la próxima apertura. Un despliegue
   cambia CACHE, el SW nuevo precarga todo y recarga las ventanas abiertas.
   ========================================================================== */
var CACHE = 'bpa-plus-v59';
var ASSETS = [
  './', './index.html', './styles.css?v=46', './manifest.json',
  './js/config.js', './js/cloud.js', './js/auth.js', './js/domain.js', './js/db.js?v=34', './js/ui.js?v=2', './js/formatos.js?v=48', './js/actas.js?v=47', './js/retiro.js?v=40', './js/views.js?v=55', './js/lock.js?v=3', './js/drive.js?v=50', './js/alerts.js', './js/app.js?v=38',
  './autoinspecciones/index.html', './autoinspecciones/main.js',
  './icons/icon-44.png?v=4', './icons/icon-192.png?v=4', './icons/icon-512.png?v=4', './icons/apple-touch-icon.png?v=4'
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
