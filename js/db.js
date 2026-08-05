/* ==========================================================================
   BPA-Plus — db.js
   Firestore es la fuente principal y conserva cache offline. IndexedDB se
   mantiene solo para migrar automáticamente datos de versiones anteriores.
   ========================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'bpa-plus', DB_VERSION = 1;
  var STORES = ['droguerias', 'documentos', 'capacitaciones', 'inspecciones', 'actas', 'meta'];
  var _db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === 'meta' ? 'k' : 'id' });
          }
        });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode) { return open().then(function (db) { return db.transaction(store, mode).objectStore(store); }); }
  function reqP(request) {
    return new Promise(function (res, rej) {
      request.onsuccess = function () { res(request.result); };
      request.onerror = function () { rej(request.error); };
    });
  }

  function localGetAll(store) { return tx(store, 'readonly').then(function (os) { return reqP(os.getAll()); }); }
  function localPut(store, val) { return tx(store, 'readwrite').then(function (os) { return reqP(os.put(val)); }); }
  function localDel(store, id) { return tx(store, 'readwrite').then(function (os) { return reqP(os.delete(id)); }); }
  function localClear(store) { return tx(store, 'readwrite').then(function (os) { return reqP(os.clear()); }); }

  function localPutMany(store, vals) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, 'readwrite'), os = t.objectStore(store);
        vals.forEach(function (v) { os.put(v); });
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  function localGetMeta(k, def) {
    return tx('meta', 'readonly').then(function (os) { return reqP(os.get(k)); }).then(function (r) { return r ? r.v : def; });
  }
  function localSetMeta(k, v) { return localPut('meta', { k: k, v: v }); }

  function cloud() { return global.BPAPLUS.cloud; }
  function getAll(store) { return cloud() ? cloud().all(store) : localGetAll(store); }
  function put(store, val) { return cloud() ? cloud().put(store, val) : localPut(store, val); }
  function del(store, id) { return cloud() ? cloud().del(store, id) : localDel(store, id); }
  function clear(store) { return cloud() ? cloud().clear(store) : localClear(store); }
  function putMany(store, vals) { return cloud() ? cloud().putMany(store, vals) : localPutMany(store, vals); }
  function getMeta(k, def) {
    return getAll('meta').then(function (rows) {
      var row = rows.filter(function (r) { return r.k === k; })[0];
      return row ? row.v : def;
    });
  }
  function setMeta(k, v) { return put('meta', { k: k, v: v }); }

  /* ---------- Datos de ejemplo (solo primer uso) ---------- */
  function seed() {
    var D = global.BPAPLUS.domain, nid = D.nextId, off = D.isoDesdeHoy;
    var dgId = 'ejemplo';
    var drogueria = {
      id: dgId, nombre: 'Droguería de ejemplo', ruc: '20481234567',
      init: 'DE', criterios: D.CRITERIOS_DEFAULT.slice(),
      direccion: 'Av. Industrial 123, Lima', dt: 'Q.F. Responsable Técnico', createdAt: Date.now()
    };

    var documentos = [
      ['POE-ALM-001', 'Recepción de productos farmacéuticos', 'Almacén', 'POE', off(320)],
      ['POE-ALM-002', 'Control de temperatura y humedad', 'Almacén', 'POE', off(41)],
      ['POE-ALM-003', 'Limpieza y sanitización del almacén', 'Almacén', 'POE', off(-12)],
      ['POE-CAL-004', 'Control de plagas', 'Calidad', 'POE', off(150)],
      ['FOR-ALM-011', 'Registro de recepción de mercadería', 'Almacén', 'Formato', off(28)],
      ['FOR-ALM-012', 'Registro de control de temperatura', 'Almacén', 'Formato', off(210)],
      ['INS-ALM-021', 'Uso del datalogger de temperatura', 'Almacén', 'Instructivo', off(-3)],
      ['MAN-CAL-031', 'Manual de Buenas Prácticas de Almacenamiento', 'Calidad', 'Manual', off(500)]
    ].map(function (r, i) {
      return { id: nid(), e: dgId, codigo: r[0], nombre: r[1], area: r[2], tipo: r[3], version: (i % 3) + 1, rev: r[4], criterio: '', createdAt: Date.now() };
    });

    var caps = [
      ['Inducción en BPA para personal nuevo', 'Calidad', 'Anual', off(-8), null],
      ['Control de temperatura y cadena de frío', 'Almacén', 'Semestral', off(15), null],
      ['Manejo de productos de control especial', 'Almacén', 'Anual', off(60), null],
      ['Procedimiento de limpieza del almacén', 'Almacén', 'Trimestral', off(-40), 'realizada'],
      ['Trazabilidad y manejo de lotes', 'Calidad', 'Anual', off(120), null]
    ].map(function (r) {
      return {
        id: nid(), e: dgId, tema: r[0], area: r[1], frec: r[2], fecha: r[3], est: r[4] || 'pendiente',
        capacitados: r[4] === 'realizada' ? [{ nombre: 'Nombre de ejemplo', cargo: 'Auxiliar de almacén' }] : [], createdAt: Date.now()
      };
    });

    var insp = [
      { id: nid(), e: dgId, area: 'Almacén general', prog: off(-20), real: off(-18), result: 'Inspección realizada; observaciones menores en rotulado de cuarentena.', hall: 2, createdAt: Date.now() },
      { id: nid(), e: dgId, area: 'Área de cadena de frío', prog: off(25), real: null, result: '', hall: 0, createdAt: Date.now() },
      { id: nid(), e: dgId, area: 'Almacén general', prog: off(-2), real: null, result: '', hall: 0, createdAt: Date.now() }
    ];

    return putMany('droguerias', [drogueria])
      .then(function () { return putMany('documentos', documentos); })
      .then(function () { return putMany('capacitaciones', caps); })
      .then(function () { return putMany('inspecciones', insp); })
      .then(function () { return setMeta('dgActiva', dgId); })
      .then(function () { return setMeta('seeded', true); });
  }

  function ensureSeed() {
    return getMeta('seeded', false).then(function (done) {
      if (done) return false;
      if (cloud()) {
        return localGetMeta('seeded', false).then(function (hasLocal) {
          if (!hasLocal) return seed().then(function () { return true; });
          return Promise.all(STORES.map(function (s) { return localGetAll(s); })).then(function (groups) {
            return Promise.all(STORES.map(function (s, i) {
              return groups[i].length ? cloud().putMany(s, groups[i]) : null;
            }));
          }).then(function () { return true; });
        });
      }
      return seed().then(function () { return true; });
    });
  }

  /* ---------- Respaldo: exportar / importar ---------- */
  function exportAll() {
    return Promise.all(STORES.map(function (s) { return getAll(s); })).then(function (arrs) {
      var out = { app: 'bpa-plus', version: DB_VERSION, exportedAt: new Date().toISOString() };
      STORES.forEach(function (s, i) { out[s] = arrs[i]; });
      return out;
    });
  }

  function importAll(data, replace) {
    var ops = STORES.map(function (s) {
      var rows = data[s] || [];
      var chain = replace ? clear(s) : Promise.resolve();
      return chain.then(function () { return rows.length ? putMany(s, rows) : null; });
    });
    return Promise.all(ops);
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.db = {
    open: open, getAll: getAll, put: put, del: del, clear: clear, putMany: putMany,
    getMeta: getMeta, setMeta: setMeta, ensureSeed: ensureSeed,
    exportAll: exportAll, importAll: importAll, STORES: STORES
  };
})(window);
