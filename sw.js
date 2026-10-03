/* ==========================================================================
   BPA-Plus — sw.js
   Service worker network-first: actualiza en línea y usa caché sin conexión
   que se visitó al menos una vez servida por http(s).
   ========================================================================== */
var CACHE = 'bpa-plus-v58';
var ASSETS = [
  './', './index.html', './styles.css?v=45', './manifest.json',
  './js/config.js', './js/cloud.js', './js/auth.js', './js/domain.js', './js/db.js?v=33', './js/ui.js?v=2', './js/formatos.js?v=48', './js/actas.js?v=47', './js/retiro.js?v=40', './js/views.js?v=55', './js/lock.js?v=2', './js/drive.js?v=50', './js/alerts.js', './js/app.js?v=37',
  './autoinspecciones/index.html', './autoinspecciones/main.js',
  './icons/icon-44.png?v=4', './icons/icon-192.png?v=4', './icons/icon-512.png?v=4', './icons/apple-touch-icon.png?v=4'
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
