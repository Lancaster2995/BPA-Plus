/* Firebase: autenticacion y Firestore, con cache offline nativa. */
(function (global) {
  'use strict';

  var VERSION = '10.12.0';
  var config = global.BPAPLUS_CONFIG && global.BPAPLUS_CONFIG.firebase;
  var api, auth, db, uid = '', loading;

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

  function all(store) {
    return api.getDocs(col(store)).then(function (snap) { return snap.docs.map(function (d) { return d.data(); }); });
  }
  function put(store, row) {
    needUser();
    return api.setDoc(api.doc(db, 'users', uid, store, rowId(store, row)), clean(row));
  }
  function putMany(store, rows) { return Promise.all(rows.map(function (row) { return put(store, row); })); }
  function del(store, id) { needUser(); return api.deleteDoc(api.doc(db, 'users', uid, store, String(id))); }
  function clear(store) {
    return api.getDocs(col(store)).then(function (snap) {
      return Promise.all(snap.docs.map(function (d) { return api.deleteDoc(d.ref); }));
    });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.cloud = {
    init: init,
    setUid: function (value) { uid = value || ''; },
    getAuth: function () { return auth; },
    api: function () { return api; },
    all: all, put: put, putMany: putMany, del: del, clear: clear
  };
})(window);
