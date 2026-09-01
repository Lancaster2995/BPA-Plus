/* ==========================================================================
   BPA-Plus — sw.js
   Service worker cache-first: deja la app utilizable sin conexión una vez
   que se visitó al menos una vez servida por http(s).
   ========================================================================== */
var CACHE = 'bpa-plus-v17';
var ASSETS = [
  './', './index.html', './styles.css', './manifest.json',
  './js/config.js', './js/cloud.js', './js/auth.js', './js/domain.js', './js/db.js', './js/ui.js', './js/formatos.js', './js/actas.js', './js/retiro.js', './js/views.js', './js/lock.js', './js/drive.js', './js/alerts.js', './js/app.js',
  './autoinspecciones/index.html', './autoinspecciones/main.js',
  './icons/icon-44.png?v=3', './icons/icon-192.png?v=3', './icons/icon-512.png?v=3', './icons/apple-touch-icon.png?v=3'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var network = fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
