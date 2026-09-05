/* ==========================================================================
   BPA-Plus — sw.js
   Service worker network-first: actualiza en línea y usa caché sin conexión
   que se visitó al menos una vez servida por http(s).
   ========================================================================== */
var CACHE = 'bpa-plus-v26';
var ASSETS = [
  './', './index.html', './styles.css', './manifest.json',
  './js/config.js', './js/cloud.js', './js/auth.js', './js/domain.js', './js/db.js', './js/ui.js', './js/formatos.js', './js/actas.js', './js/retiro.js', './js/views.js', './js/lock.js', './js/drive.js?v=26', './js/alerts.js', './js/app.js?v=26',
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
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) {
        return Promise.all(clients.map(function (client) {
          return client.navigate(client.url).catch(function () {});
        }));
      })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || !/^https?:/.test(e.request.url)) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { return c.put(e.request, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
