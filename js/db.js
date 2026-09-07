/* ==========================================================================
   BPA-Plus — db.js
   Firestore es la fuente principal y conserva cache offline. IndexedDB se
   mantiene solo para migrar automáticamente datos de versiones anteriores.
   ========================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'bpa-plus', DB_VERSION = 1;
  var STORES = ['droguerias', 'documentos', 'capacitaciones', 'inspecciones', 'actas', 'retiros', 'meta'];
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

  /* Logo de ITC (300 px, PNG recortado) para el membrete de los datos de ejemplo. Va en
     la droguería como data URI: se imprime sin conexión y viaja con ella. Cada droguería
     carga el suyo desde el formulario. */
  var LOGO_ITC = 'data:image/png;base64,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';

  /* ---------- Datos de ejemplo (solo primer uso) ---------- */
  function seed() {
    var D = global.BPAPLUS.domain, nid = D.nextId, off = D.isoDesdeHoy;
    var dgId = 'ejemplo';
    var drogueria = {
      id: dgId, nombre: 'INTELLIGENCE TECHNOLOGY COMPANY S.A.C.', ruc: '20608966405',
      init: 'ITC', criterios: D.CRITERIOS_DEFAULT.slice(),
      direccion: 'Av. Manuel Olguín 501, Int. 1105, Urb. Residencial Isabelita — Santiago de Surco, Lima',
      dt: 'EDUARDO F. CORDOVA ZORRILLA', dtCargo: 'D.T QUIMICO FARMACEUTICO', dtColegiatura: 'CQFP 29902',
      telefono: '657-1631', email: 'ventas@itc.pe', web: 'www.itc.pe',
      logo: LOGO_ITC, createdAt: Date.now()
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
      .then(function () { return putMany('retiros', [global.BPAPLUS.retiro.ejemplo(dgId)]); })
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
