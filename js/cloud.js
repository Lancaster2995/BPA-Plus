/* Firebase: autenticacion y Firestore, con cache offline nativa. */
(function (global) {
  'use strict';

  var VERSION = '10.12.0';
  var config = global.BPAPLUS_CONFIG && global.BPAPLUS_CONFIG.firebase;
  var api, auth, db, storage, funcs, uid = '', loading;
  var REGION = 'us-central1';

  function init() {
    if (loading) return loading;
    if (!config) return Promise.reject(new Error('Falta la configuración de Firebase.'));
    loading = Promise.all([
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-storage.js'),
      import('https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-functions.js')
    ]).then(function (mods) {
      var appMod = mods[0], authMod = mods[1], fireMod = mods[2], storageMod = mods[3], fnMod = mods[4];
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config);
      auth = authMod.getAuth(app);
      storage = storageMod.getStorage(app);
      funcs = fnMod.getFunctions(app, REGION);
      try {
        db = fireMod.initializeFirestore(app, {
          localCache: fireMod.persistentLocalCache({ tabManager: fireMod.persistentMultipleTabManager() })
        });
      } catch (e) { db = fireMod.getFirestore(app); }
      api = Object.assign({}, authMod, fireMod, storageMod, fnMod);
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

  function uploadFile(relativePath, file, name) {
    needUser();
    var path = 'users/' + uid + '/' + relativePath.replace(/^\/+/, '');
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    var contentType = file.type || (ext === 'pdf' ? 'application/pdf' : ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
    return api.uploadBytes(api.ref(storage, path), file, { contentType: contentType }).then(function (snap) {
      return {
        path: snap.ref.fullPath, name: name || file.name, originalName: file.name,
        size: file.size, contentType: contentType, uploadedAt: Date.now()
      };
    });
  }
  function fileBlob(path) { needUser(); return api.getBlob(api.ref(storage, path)); }

  /* Llama a una Cloud Function. El token de sesión viaja solo — por eso la
     clave de la API de Anthropic puede quedarse del lado del servidor. */
  function callFn(name, data) {
    return init().then(function () {
      needUser();
      return api.httpsCallable(funcs, name)(data || {});
    }).then(function (r) { return r.data; });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.cloud = {
    init: init,
    setUid: function (value) { uid = value || ''; },
    getAuth: function () { return auth; },
    api: function () { return api; },
    all: all, put: put, putMany: putMany, del: del, clear: clear,
    uploadFile: uploadFile, fileBlob: fileBlob, callFn: callFn
  };
})(window);
