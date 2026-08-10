/* ==========================================================================
   BPA-Plus — app.js
   Núcleo: estado en memoria + persistencia (store), enrutado por hash,
   chrome (barra lateral, barra superior, barra inferior), tema claro/oscuro,
   buscador de comandos, respaldo (exportar/importar) y arranque.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, DB = global.BPAPLUS.db, UI = global.BPAPLUS.ui, V = global.BPAPLUS.views;

  var NAV = [
    { view: 'dashboard', label: 'Panorama', icon: 'dashboard' },
    { view: 'documentos', label: 'Documentos', icon: 'doc' },
    { view: 'capacitaciones', label: 'Capacitaciones', icon: 'cap' },
    { view: 'autoinspecciones', label: 'Autoinspecciones', icon: 'insp' }
  ];

  /* ------------------------------ Store ------------------------------ */
  var store = {
    state: { dg: '', view: 'dashboard', qDoc: '', filtDoc: 'todos', filtCap: 'todos', filtInsp: 'todos' },
    data: { droguerias: [], documentos: [], capacitaciones: [], inspecciones: [], actas: [] },

    load: function () {
      return Promise.all([
        DB.getAll('droguerias'), DB.getAll('documentos'), DB.getAll('capacitaciones'),
        DB.getAll('inspecciones'), DB.getAll('actas'), DB.getMeta('dgActiva', '')
      ]).then(function (r) {
        store.data.droguerias = r[0]; store.data.documentos = r[1]; store.data.capacitaciones = r[2];
        store.data.inspecciones = r[3]; store.data.actas = r[4];
        store.state.dg = r[5] || (r[0][0] && r[0][0].id) || '';
      });
    },

    dg: function () {
      return store.data.droguerias.filter(function (e) { return e.id === store.state.dg; })[0] ||
        store.data.droguerias[0] || { id: '', nombre: '—', ruc: '', init: '?', criterios: D.CRITERIOS_DEFAULT.slice() };
    },
    byDg: function (kind) {
      var id = store.dg().id;
      return store.data[kind].filter(function (x) { return x.e === id; });
    },
    find: function (kind, id) { return store.data[kind].filter(function (x) { return x.id === id; })[0]; },

    save: function (kind, obj) {
      return DB.put(kind, obj).then(function () {
        var arr = store.data[kind], i = arr.findIndex(function (x) { return x.id === obj.id; });
        if (i >= 0) arr[i] = obj; else arr.push(obj);
        store.render(); store.renderChrome();
      }).catch(function (err) {
        UI.note('No se pudo guardar: ' + (err && err.message || err));
        throw err;
      });
    },
    remove: function (kind, id) {
      return DB.del(kind, id).then(function () {
        store.data[kind] = store.data[kind].filter(function (x) { return x.id !== id; });
        store.render(); store.renderChrome();
      }).catch(function (err) {
        UI.note('No se pudo eliminar: ' + (err && err.message || err));
        throw err;
      });
    },
    removeWithUndo: function (kind, obj, msg) {
      store.remove(kind, obj.id).then(function () {
        UI.note(msg, { actionLabel: 'Deshacer', onAction: function () { store.save(kind, obj); } });
      }).catch(function () {});
    },

    setDg: function (id) {
      store.state.dg = id; DB.setMeta('dgActiva', id);
      store.state.qDoc = ''; store.state.filtDoc = 'todos'; store.state.filtCap = 'todos'; store.state.filtInsp = 'todos';
      store.render(); store.renderChrome();
    },
    deleteDg: function (id) {
      var kinds = ['documentos', 'capacitaciones', 'inspecciones', 'actas'];
      var ops = store.data.droguerias.filter(function (e) { return e.id === id; }).map(function (e) { return DB.del('droguerias', e.id); });
      kinds.forEach(function (k) { store.data[k].filter(function (x) { return x.e === id; }).forEach(function (x) { ops.push(DB.del(k, x.id)); }); });
      Promise.all(ops).then(function () {
        store.data.droguerias = store.data.droguerias.filter(function (e) { return e.id !== id; });
        kinds.forEach(function (k) { store.data[k] = store.data[k].filter(function (x) { return x.e !== id; }); });
        store.setDg(store.data.droguerias[0] ? store.data.droguerias[0].id : '');
        UI.note('Droguería eliminada');
      });
    },

    go: function (view) { location.hash = '#/' + view; },

    render: function () { store.renderInto(); },
    renderInto: function () {
      var el = document.getElementById('content');
      var active = document.activeElement, wasSearch = active && active.id === 'qDoc';
      var caret = wasSearch ? active.selectionStart : null;
      el.innerHTML = V.render(store.state.view);
      if (wasSearch) { var s = document.getElementById('qDoc'); if (s) { s.focus(); try { s.setSelectionRange(caret, caret); } catch (e) {} } }
    },
    renderChrome: renderChrome,
    exportData: exportData
  };

  /* ------------------------------ Chrome ------------------------------ */
  function navCounts() {
    var docs = store.byDg('documentos'), caps = store.byDg('capacitaciones'), insp = store.byDg('inspecciones');
    return {
      documentos: docs.filter(function (d) { return D.edoc(d) === 'vencido'; }).length,
      capacitaciones: caps.filter(function (c) { var e = D.ecap(c); return e === 'vencida' || e === 'pendiente'; }).length,
      autoinspecciones: insp.reduce(function (a, i) { return a + (i.real ? (i.hall || 0) : 0); }, 0) + insp.filter(function (i) { return !i.real && D.dias(i.prog) < 0; }).length
    };
  }

  function renderChrome() {
    var dg = store.dg(), counts = navCounts(), v = store.state.view;

    var side = document.getElementById('sidebar');
    var alertN = global.BPAPLUS.alerts ? global.BPAPLUS.alerts.count() : 0;
    if (side) side.innerHTML =
      '<div class="brand"><div class="brand-mark"><img src="icons/icon-192.png" alt=""></div><div><div class="brand-name">BPA-Plus</div><div class="brand-sub">Gestión BPA</div></div>' +
        '<button class="bell-btn" id="alertBell" aria-label="Alertas">' + UI.icon('alert', 18) + (alertN ? '<span class="bell-badge">' + alertN + '</span>' : '') + '</button></div>' +
      '<button class="dg-switch" id="dgSwitch"><div class="dg-avatar">' + UI.esc(dg.init || '?') + '</div>' +
        '<div class="dg-txt"><div class="dg-name">' + UI.esc(dg.nombre) + '</div><div class="dg-ruc mono">' + (dg.ruc ? 'RUC ' + UI.esc(dg.ruc) : 'Sin RUC') + '</div></div>' +
        '<span class="chev">' + UI.icon('chevron', 14) + '</span></button>' +
      '<nav class="nav">' + NAV.map(function (n) {
        var c = counts[n.view] || 0;
        return '<button class="nav-item ' + (v === n.view ? 'active' : '') + '" data-nav="' + n.view + '">' +
          UI.icon(n.icon, 18, 'ni-ico') + '<span>' + n.label + '</span>' + (c ? '<span class="ni-badge">' + c + '</span>' : '') + '</button>';
      }).join('') + '</nav>' +
      '<div class="sidebar-foot">' +
        '<button class="side-mini" id="cmdOpen">' + UI.icon('search', 16) + '<span>Buscar</span><span class="kbd mono">Ctrl K</span></button>' +
        '<button class="side-mini" id="driveImport">' + UI.icon('upload', 16) + '<span>Escanear carpeta BPA</span></button>' +
        '<button class="side-mini" id="cronImport">' + UI.icon('cap', 16) + '<span>Importar cronograma Excel</span></button>' +
        '<button class="side-mini" id="importBtn">' + UI.icon('upload', 16) + '<span>Importar respaldo</span></button>' +
        '<button class="side-mini" id="exportBtn">' + UI.icon('download', 16) + '<span>Exportar respaldo</span></button>' +
        '<button class="side-mini" id="lockBtn">' + UI.icon('settings', 16) + '<span>Cambiar PIN</span></button>' +
        '<button class="side-mini" id="logoutBtn">' + UI.icon('x', 16) + '<span>Cerrar sesión</span></button>' +
        '<button class="side-mini" id="themeBtn">' + UI.icon(isDark() ? 'sun' : 'moon', 16) + '<span>' + (isDark() ? 'Tema claro' : 'Tema oscuro') + '</span></button>' +
      '</div>';

    var top = document.getElementById('topbar');
    if (top) top.innerHTML =
      '<div class="brand-mark sm"><img src="icons/icon-192.png" alt=""></div>' +
      '<div class="top-mid"><div class="top-title">' + (NAV.filter(function (n) { return n.view === v; })[0] || { label: 'BPA-Plus' }).label + '</div>' +
      '<div class="top-dg">' + UI.esc(dg.nombre) + '</div></div>' +
      '<button class="icon-btn" id="alertBellM" aria-label="Alertas">' + UI.icon('alert', 20) + (alertN ? '<span class="bell-badge sm">' + alertN + '</span>' : '') + '</button>' +
      '<button class="icon-btn" id="cmdOpenM" aria-label="Buscar">' + UI.icon('search', 20) + '</button>' +
      '<button class="icon-btn" id="dgSwitchM" aria-label="Cambiar droguería">' + UI.icon('building', 20) + '</button>' +
      '<button class="icon-btn" id="themeBtnM" aria-label="Tema">' + UI.icon(isDark() ? 'sun' : 'moon', 20) + '</button>';

    var bn = document.getElementById('bottomNav');
    if (bn) bn.innerHTML = '<div class="bn-inner">' + NAV.map(function (n) {
      var c = counts[n.view] || 0;
      return '<button class="bn-item ' + (v === n.view ? 'active' : '') + '" data-nav="' + n.view + '">' +
        UI.icon(n.icon, 21) + '<span>' + n.label.split(' ')[0] + '</span>' + (c ? '<span class="bn-badge">' + c + '</span>' : '') + '</button>';
    }).join('') + '</div>';

    wireChrome();
  }

  function wireChrome() {
    document.querySelectorAll('[data-nav]').forEach(function (b) { b.onclick = function () { store.go(b.dataset.nav); }; });
    var ds = document.getElementById('dgSwitch'); if (ds) ds.onclick = V.open.dgSwitcher;
    var dsm = document.getElementById('dgSwitchM'); if (dsm) dsm.onclick = V.open.dgSwitcher;
    var im = document.getElementById('importBtn'); if (im) im.onclick = importData;
    var ex = document.getElementById('exportBtn'); if (ex) ex.onclick = exportData;
    var lk = document.getElementById('lockBtn'); if (lk) lk.onclick = function () { global.BPAPLUS.lock.openSettings(); };
    var lo = document.getElementById('logoutBtn'); if (lo) lo.onclick = function () {
      var Auth = global.BPAPLUS.auth;
      if (Auth) Auth.signOut().then(function () { location.reload(); }); else location.reload();
    };
    var th = document.getElementById('themeBtn'); if (th) th.onclick = toggleTheme;
    var thm = document.getElementById('themeBtnM'); if (thm) thm.onclick = toggleTheme;
    var co = document.getElementById('cmdOpen'); if (co) co.onclick = openCmd;
    var com = document.getElementById('cmdOpenM'); if (com) com.onclick = openCmd;
    var ab = document.getElementById('alertBell'); if (ab) ab.onclick = function () { global.BPAPLUS.alerts.open(); };
    var abm = document.getElementById('alertBellM'); if (abm) abm.onclick = function () { global.BPAPLUS.alerts.open(); };
    var di = document.getElementById('driveImport');
    if (di) di.onclick = function () {
      global.BPAPLUS.drive.importPanel(function (drafts) {
        var nuevos = 0, actualizados = 0;
        Promise.all(drafts.map(function (d) {
          var existing = d.existingId ? store.find('documentos', d.existingId) : null;
          var file = d._file;
          var clean = Object.assign({}, d); delete clean.existingId; delete clean.modifiedTime; delete clean._mergedFrom; delete clean._file;
          var obj = existing ? Object.assign({}, existing, clean, { id: existing.id }) : Object.assign({ id: D.nextId(), e: store.dg().id, area: 'Almacén', version: 1 }, clean);
          if (existing) actualizados++; else nuevos++;
          var ready = file ? global.BPAPLUS.drive.storeFile(store.dg().id, obj, file, clean.role, clean.version) : Promise.resolve(obj);
          return ready.then(function (saved) { return store.save('documentos', saved); });
        })).then(function () { UI.note(nuevos + ' nuevo(s), ' + actualizados + ' actualizado(s) en la biblioteca'); })
          .catch(function (err) { UI.note('No se pudieron subir los archivos: ' + (err && err.message || err)); });
      }, store.byDg('documentos'));
    };
    var ci = document.getElementById('cronImport');
    if (ci) ci.onclick = function () {
      global.BPAPLUS.drive.cronogramaPanel(function (drafts) {
        var caps = drafts.capacitaciones || [], inspecciones = drafts.inspecciones || [];
        Promise.all(caps.map(function (c) {
          var existing = c.existingId ? store.find('capacitaciones', c.existingId) : null;
          var clean = Object.assign({}, c); delete clean.existingId;
          return store.save('capacitaciones', existing
            ? Object.assign({}, existing, clean, { id: existing.id })
            : Object.assign({ id: D.nextId(), e: store.dg().id, est: 'pendiente', capacitados: [] }, clean));
        }).concat(inspecciones.map(function (i) {
          var existing = i.existingId ? store.find('inspecciones', i.existingId) : null;
          var clean = Object.assign({}, i); delete clean.existingId;
          return store.save('inspecciones', existing
            ? Object.assign({}, existing, clean, { id: existing.id })
            : Object.assign({ id: D.nextId(), e: store.dg().id, real: null, result: '', hall: 0 }, clean));
        }))).then(function () { UI.note(caps.length + ' capacitación(es), ' + inspecciones.length + ' autoinspección(es) importadas'); });
      }, store.byDg('capacitaciones'), store.byDg('inspecciones'));
    };
  }

  /* ------------------------------ Tema ------------------------------ */
  var THEME_KEY = 'bpa-plus-theme-v2';
  function isDark() { return document.documentElement.classList.contains('dark'); }
  function applyTheme(t) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    var meta = document.getElementById('themeColor');
    if (meta) meta.content = t === 'dark' ? '#0A1220' : '#F5F7FA';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function toggleTheme() { applyTheme(isDark() ? 'light' : 'dark'); renderChrome(); }

  /* ------------------------------ Respaldo ------------------------------ */
  function exportData() {
    DB.exportAll().then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bpa-plus-respaldo-' + D.isoHoy() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      UI.note('Respaldo exportado');
    });
  }

  function importData() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = function () {
      var file = inp.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data; try { data = JSON.parse(reader.result); } catch (e) { UI.note('Archivo inválido'); return; }
        if (!data || (data.app !== 'bpa-plus' && data.app !== 'bpa-beast')) { UI.note('No es un respaldo de BPA-Plus'); return; }
        UI.confirm({ title: 'Importar respaldo', message: 'Se reemplazarán todos los datos actuales por los del archivo. ¿Continuar?', okLabel: 'Importar', danger: true })
          .then(function (ok) {
            if (!ok) return;
            var normalized = data;
            if (data.app === 'bpa-beast' && data.empresas) { normalized = Object.assign({}, data, { droguerias: data.empresas }); }
            DB.importAll(normalized, true).then(function () { return store.load(); }).then(function () { store.render(); store.renderChrome(); UI.note('Respaldo importado'); });
          });
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  /* ------------------------------ Buscador de comandos ------------------------------ */
  var cmdEl;
  function buildCmdIndex() {
    var idx = [];
    NAV.forEach(function (n) { idx.push({ type: 'Ir a', name: n.label, run: function () { store.go(n.view); } }); });
    idx.push({ type: 'Acción', name: 'Nuevo documento', run: function () { V.open.docForm(null); } });
    idx.push({ type: 'Acción', name: 'Nueva capacitación', run: function () { V.open.capForm(null); } });
    idx.push({ type: 'Acción', name: 'Programar autoinspección', run: function () { V.open.inspForm(null); } });
    idx.push({ type: 'Acción', name: 'Nueva acta de inspección', run: function () { V.open.actaForm(null); } });
    idx.push({ type: 'Acción', name: 'Exportar respaldo', run: exportData });
    store.byDg('documentos').forEach(function (d) { idx.push({ type: 'Documento', name: d.codigo + ' · ' + d.nombre, run: function () { V.panels.docPanel(d); } }); });
    store.byDg('capacitaciones').forEach(function (c) { idx.push({ type: 'Capacitación', name: c.tema, run: function () { V.panels.capPanel(c); } }); });
    store.byDg('inspecciones').forEach(function (i) { idx.push({ type: 'Autoinspección', name: i.area + ' · ' + D.fLocal(i.prog), run: function () { V.panels.inspPanel(i); } }); });
    return idx;
  }

  function openCmd() {
    if (cmdEl) return;
    var index = buildCmdIndex(), sel = 0, filtered = index.slice(0, 8);
    cmdEl = document.createElement('div'); cmdEl.className = 'finder';
    var bd = document.createElement('div'); bd.className = 'scrim';
    cmdEl.innerHTML = '<div class="finder-box"><div class="finder-input">' + UI.icon('search', 20) +
      '<input type="text" id="cmdInput" placeholder="Buscar o ejecutar una acción…" autocomplete="off"></div>' +
      '<div class="finder-results" id="cmdResults"></div></div>';
    document.body.appendChild(bd); document.body.appendChild(cmdEl);

    function close() { bd.remove(); cmdEl.remove(); cmdEl = null; }
    function draw() {
      var box = document.getElementById('cmdResults');
      box.innerHTML = filtered.length ? filtered.map(function (it, i) {
        return '<div class="finder-item ' + (i === sel ? 'active' : '') + '" data-i="' + i + '"><span class="fi-type">' + UI.esc(it.type) + '</span><span class="fi-name">' + UI.esc(it.name) + '</span></div>';
      }).join('') : '<div class="finder-empty">Sin resultados</div>';
      box.querySelectorAll('.finder-item').forEach(function (el) { el.onclick = function () { var it = filtered[+el.dataset.i]; close(); it.run(); }; });
    }
    function filter(q) {
      q = D.normTxt(q);
      filtered = (q ? index.filter(function (it) { return D.normTxt(it.type + ' ' + it.name).includes(q); }) : index).slice(0, 40);
      sel = 0; draw();
    }
    var input = document.getElementById('cmdInput');
    input.addEventListener('input', function () { filter(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); draw(); scrollSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); scrollSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); var it = filtered[sel]; if (it) { close(); it.run(); } }
      else if (e.key === 'Escape') { close(); }
    });
    function scrollSel() { var a = document.querySelector('.finder-item.active'); if (a) a.scrollIntoView({ block: 'nearest' }); }
    bd.onclick = close;
    requestAnimationFrame(function () { bd.classList.add('show'); cmdEl.classList.add('show'); input.focus(); });
    draw();
  }

  /* ------------------------------ Router ------------------------------ */
  function route() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var view = NAV.filter(function (n) { return n.view === h; })[0] ? h : 'dashboard';
    store.state.view = view;
    store.render(); store.renderChrome();
    window.scrollTo(0, 0);
  }

  /* ------------------------------ Botón de acción rápida (móvil) ------------------------------ */
  function wireFab() {
    var fab = document.getElementById('fab');
    if (fab) fab.onclick = function () {
      var v = store.state.view;
      if (v === 'documentos') return V.open.docForm(null);
      if (v === 'capacitaciones') return V.open.capForm(null);
      if (v === 'autoinspecciones') return UI.actionsheet([
        { label: 'Nueva acta de inspección', icon: 'insp', onClick: function () { V.open.actaForm(null); } },
        { label: 'Programar autoinspección', icon: 'plus', onClick: function () { V.open.inspForm(null); } }
      ]);
      UI.actionsheet([
        { label: 'Nuevo documento', icon: 'doc', onClick: function () { V.open.docForm(null); } },
        { label: 'Nueva capacitación', icon: 'cap', onClick: function () { V.open.capForm(null); } },
        { label: 'Nueva acta de inspección', icon: 'insp', onClick: function () { V.open.actaForm(null); } }
      ]);
    };
  }

  /* ------------------------------ Arranque ------------------------------ */
  function boot() {
    var saved; try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(saved || 'light');

    var Lock = global.BPAPLUS.lock, Auth = global.BPAPLUS.auth;
    function start() {
      V.setStore(store);
      if (global.BPAPLUS.alerts) global.BPAPLUS.alerts.setStore(store, V);
      var content = document.getElementById('content');
      V.bind(content);

      document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openCmd(); }
      });
      window.addEventListener('hashchange', route);
      wireFab();

      DB.ensureSeed()
        .then(function () { return store.load(); })
        .then(function () { route(); })
        .catch(function (err) {
          content.innerHTML = '<div class="empty"><span class="es-title">No se pudieron cargar tus datos</span>' +
            '<span class="es-sub">' + UI.esc(err && err.message || err) + '</span></div>';
        });
    }
    function unlock() { if (Lock) Lock.gate(start); else start(); }
    if (Auth) Auth.gate(unlock); else unlock();
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.store = store;
  global.BPAPLUS.app = { boot: boot };

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})(window);
