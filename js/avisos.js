/* ==========================================================================
   BPA-Plus — avisos.js
   Avisos push en el teléfono, con el enfoque de LogisticS: la app le pasa al
   Worker la lista de vencimientos de TODAS las droguerías (la misma de
   alerts.js) y el Worker avisa una vez al día lo que toca (worker/avisos.js).
   Lo cargan la web —así lo que se renueva en el escritorio deja de avisar— y
   la app móvil, que es la que activa los avisos en el teléfono.
   ========================================================================== */
(function (global) {
  'use strict';

  /* Clave VAPID PÚBLICA: la privada es el secreto VAPID_PRIVATE_KEY del Worker. Cambiarla obliga a
     reactivar los avisos en cada teléfono. */
  var VAPID_KEY = 'BBytDFvZNSUImWk_Kdk2HJCVzFFZ1avT4KkDs16vv3p1rFvH1oEPrcwELKgGxfOFhPQH7ycZaheHsy_j_H_BAgY';
  var VENTANA = 365;                  // días hacia adelante que el Worker conoce
  var LLAVE = 'bpa-plus-avisos-v1';   // última lista que el Worker guardó, para no reenviarla igual
  var timer = null;

  function cloud() { var c = global.BPAPLUS.cloud; return c && c.callFn ? c : null; }

  function lista() {
    var A = global.BPAPLUS.alerts;
    return (A ? A.collect(VENTANA) : []).filter(function (it) { return it.fecha; }).slice(0, 500).map(function (it) {
      return {
        id: it.kind + ':' + it.obj.id, kind: it.kind, fecha: String(it.fecha).slice(0, 10),
        titulo: String(it.titulo || '').slice(0, 120), dg: String(it.dg.init || it.dg.nombre || '').slice(0, 60)
      };
    });
  }

  function sincronizar(forzar) {
    var c = cloud();
    if (!c) return Promise.resolve(null);
    var items = lista(), firma = JSON.stringify(items), previa = null;
    try { previa = localStorage.getItem(LLAVE); } catch (e) {}
    if (!forzar && previa === firma) return Promise.resolve(null);
    return c.callFn('avisos/sync', { items: items }).then(function (r) {
      // Sin teléfonos activados el Worker no guarda nada: no se marca como enviada.
      if (r && r.activo) { try { localStorage.setItem(LLAVE, firma); } catch (e) {} }
      return r;
    });
  }

  /* Al abrir y después de cada cambio, sin apuro: varios guardados seguidos son una sola llamada. */
  function programar() {
    clearTimeout(timer);
    timer = setTimeout(function () { sincronizar().catch(function () { /* sin red: va la próxima vez */ }); }, 3000);
  }

  // En el iPhone solo existe dentro de la app añadida a la pantalla de inicio, no en una pestaña de Safari.
  function soportado() { return 'PushManager' in global && 'Notification' in global && 'serviceWorker' in navigator; }

  function activo() {
    if (!soportado() || Notification.permission !== 'granted') return Promise.resolve(false);
    return navigator.serviceWorker.getRegistration()
      .then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; })
      .then(function (s) { return !!s; });
  }

  /* Llamar DENTRO del toque: iOS solo pide el permiso ante un gesto, así que requestPermission va
     antes de cualquier otra espera. El Worker guarda el teléfono solo si le llega el aviso de prueba. */
  function activar() {
    return Notification.requestPermission().then(function (permiso) {
      if (permiso !== 'granted') throw new Error('Notificaciones bloqueadas: actívalas en los ajustes del teléfono para BPA Plus.');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      var key = Uint8Array.from(atob(VAPID_KEY.replace(/-/g, '+').replace(/_/g, '/')), function (ch) { return ch.charCodeAt(0); });
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(function () {
        throw new Error('El teléfono no aceptó la suscripción. En el iPhone, abre BPA Plus desde la pantalla de inicio.');
      });
    }).then(function (sub) {
      return cloud().callFn('push/subscribe', sub.toJSON());
    }).then(function () { return sincronizar(true); });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.avisos = {
    lista: lista, sincronizar: sincronizar, programar: programar,
    soportado: soportado, activo: activo, activar: activar
  };
})(window);
