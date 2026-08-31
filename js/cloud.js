/* Firebase: autenticacion y Firestore, con cache offline nativa. */
(function (global) {
  'use strict';

  var VERSION = '10.12.0';
  var config = global.BPAPLUS_CONFIG && global.BPAPLUS_CONFIG.firebase;
  var api, auth, db, uid = '', loading;

  /* Sin Storage ni Functions: los dos exigen el plan Blaze y este proyecto está en Spark.
     Los archivos viven en el Drive del usuario (js/drive.js) y la generación de
     evaluaciones en un worker de Cloudflare (ver `callFn`). Queda Auth + Firestore. */
  function init() {
    if (loading) return loading;
    if (!config) return Promise.reject(new Error('Falta la configuración de Firebase.'));
    loading = Promise.all([
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-firestore.js')
    ]).then(function (mods) {
      var appMod = mods[0], authMod = mods[1], fireMod = mods[2];
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config);
      auth = authMod.getAuth(app);
      try {
        db = fireMod.initializeFirestore(app, {
          localCache: fireMod.persistentLocalCache({ tabManager: fireMod.persistentMultipleTabManager() })
        });
      } catch (e) { db = fireMod.getFirestore(app); }
      api = Object.assign({}, authMod, fireMod);
      return true;
    });
    return loading;
  }

  function needUser() {
    if (!uid) throw new Error('La sesión no está iniciada.');
  }
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) { if (value[k] !== undefined) out[k] = clean(value[k]); });
      return out;
    }
    return value;
  }
  function rowId(store, row) { return String(store === 'meta' ? row.k : row.id); }
  function col(store) { needUser(); return api.collection(db, 'users', uid, store); }

  /* Una escritura de Firestore se resuelve cuando el SERVIDOR la confirma. Sin red la
     promesa queda pendiente para siempre, aunque la caché persistente ya aplicó el cambio
     y lo reenviará sola al reconectar. La app espera esa promesa antes de tocar su estado,
     así que guardar o eliminar sin red no movía nada en pantalla: es el "hago clic y no
     pasa nada" que se reportó. Se resuelve con la escritura ya encolada —que es lo que la
     interfaz necesita saber— y el rechazo real (permisos, reglas) se avisa cuando llega.
     ponytail: no distingue "guardado" de "sincronizado"; si algún día hace falta ese
     indicador, se construye aquí. */
  function enCola(escritura) {
    escritura.catch(function (err) {
      var ui = global.BPAPLUS && global.BPAPLUS.ui;
      if (ui) ui.note('No se pudo sincronizar con la nube: ' + (err && err.message || err));
    });
    return Promise.resolve();
  }

  function all(store) {
    return api.getDocs(col(store)).then(function (snap) { return snap.docs.map(function (d) { return d.data(); }); });
  }
  function put(store, row) {
    needUser();
    return enCola(api.setDoc(api.doc(db, 'users', uid, store, rowId(store, row)), clean(row)));
  }
  function putMany(store, rows) { return Promise.all(rows.map(function (row) { return put(store, row); })); }
  function del(store, id) { needUser(); return enCola(api.deleteDoc(api.doc(db, 'users', uid, store, String(id)))); }
  function clear(store) {
    return api.getDocs(col(store)).then(function (snap) {
      return enCola(Promise.all(snap.docs.map(function (d) { return api.deleteDoc(d.ref); })));
    });
  }

  /* Llama al worker. El ID token de la sesión viaja en `Authorization` y el worker lo
     verifica contra las claves públicas de Google — por eso la clave de la API de
     Anthropic puede quedarse del lado del servidor. Es lo mismo que daba gratis un
     callable de Firebase; sin Blaze hay que pedirlo a mano. */
  function callFn(name, data) {
    return init().then(function () {
      needUser();
      var base = global.BPAPLUS_CONFIG && global.BPAPLUS_CONFIG.workerUrl;
      if (!base) throw new Error('Falta configurar workerUrl en js/config.js.');
      var user = auth.currentUser;
      if (!user) throw new Error('La sesión no está iniciada.');
      return user.getIdToken().then(function (token) {
        return fetch(base.replace(/\/+$/, '') + '/' + name, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(data || {})
        });
      });
    }).then(function (res) {
      return res.text().then(function (raw) {
        var body;
        try { body = JSON.parse(raw); } catch (e) { body = null; }
        if (!res.ok) throw new Error((body && body.error) || ('El servidor respondió ' + res.status + '.'));
        if (!body) throw new Error('El servidor respondió algo que no es JSON.');
        return body;
      });
    });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.cloud = {
    init: init,
    setUid: function (value) { uid = value || ''; },
    getAuth: function () { return auth; },
    api: function () { return api; },
    all: all, put: put, putMany: putMany, del: del, clear: clear,
    callFn: callFn
  };
})(window);
