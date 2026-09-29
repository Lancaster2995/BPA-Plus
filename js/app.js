/* ==========================================================================
   BPA-Plus — app.js
   Núcleo: estado en memoria + persistencia (store), enrutado por hash,
   chrome (barra lateral, barra superior, barra inferior), tema claro/oscuro,
   buscador de comandos, respaldo (exportar/importar) y arranque.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, DB = global.BPAPLUS.db, UI = global.BPAPLUS.ui, V = global.BPAPLUS.views;

  /* `group` arma las secciones de la barra lateral; `bottom: false` manda la vista al menú
     «Más» del celular, que así conserva cinco destinos en la barra inferior. */
  var NAV = [
    { view: 'dashboard', label: 'Inicio', short: 'Inicio', icon: 'home' },
    { view: 'documentos', label: 'Documentos', short: 'Documentos', icon: 'doc', group: 'Cumplimiento' },
    { view: 'capacitaciones', label: 'Capacitaciones', short: 'Capacitac.', icon: 'cap', group: 'Cumplimiento' },
    { view: 'autoinspecciones', label: 'Autoinspecciones', short: 'Inspecc.', icon: 'clipboard', group: 'Cumplimiento' },
    { view: 'retiros', label: 'Retiro de mercado', icon: 'flag', group: 'Cumplimiento', bottom: false },
    { view: 'informacion-almacen', label: 'Información del almacén', icon: 'building', group: 'Almacén', bottom: false },
    { view: 'documentos-inspeccion', label: 'Documentos de inspección', icon: 'folder', group: 'Almacén', bottom: false }
  ];

  /* ------------------------------ Store ------------------------------ */
  var store = {
    state: { dg: '', view: 'dashboard', qDoc: '', filtDoc: 'todos', filtCap: 'todos', filtInsp: 'todos', selDoc: '' },
    data: { droguerias: [], documentos: [], documentosInspeccion: [], capacitaciones: [], inspecciones: [], actas: [], retiros: [] },

    load: function () {
      return Promise.all([
        DB.getAll('droguerias'), DB.getAll('documentos'), DB.getAll('documentosInspeccion'), DB.getAll('capacitaciones'),
        DB.getAll('inspecciones'), DB.getAll('actas'), DB.getAll('retiros'), DB.getMeta('dgActiva', '')
      ]).then(function (r) {
        store.data.droguerias = r[0]; store.data.documentos = r[1]; store.data.documentosInspeccion = r[2]; store.data.capacitaciones = r[3];
        store.data.inspecciones = r[4]; store.data.actas = r[5]; store.data.retiros = r[6];
        store.state.dg = r[7] || (r[0][0] && r[0][0].id) || '';
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
      store.state.qDoc = ''; store.state.filtDoc = 'todos'; store.state.filtCap = 'todos'; store.state.filtInsp = 'todos'; store.state.selDoc = '';
      store.render(); store.renderChrome();
    },
    deleteDg: function (id) {
      var kinds = ['documentos', 'documentosInspeccion', 'capacitaciones', 'inspecciones', 'actas', 'retiros'];
      var ops = store.data.droguerias.filter(function (e) { return e.id === id; }).map(function (e) { return DB.del('droguerias', e.id); });
      kinds.forEach(function (k) { store.data[k].filter(function (x) { return x.e === id; }).forEach(function (x) { ops.push(DB.del(k, x.id)); }); });
      Promise.all(ops).then(function () {
        store.data.droguerias = store.data.droguerias.filter(function (e) { return e.id !== id; });
        kinds.forEach(function (k) { store.data[k] = store.data[k].filter(function (x) { return x.e !== id; }); });
        store.setDg(store.data.droguerias[0] ? store.data.droguerias[0].id : '');
        UI.note('Droguería eliminada');
      }).catch(function (err) {
        // Igual que save/remove: un borrado que falla tiene que decirlo, no quedarse callado.
        UI.note('No se pudo eliminar: ' + (err && err.message || err));
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
    exportData: exportData,
    importCronograma: importCronograma
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

  function syncChip() {
    if (!global.BPAPLUS.cloud) return '<div class="sync">' + UI.icon('check', 15) + '<span>Guardado en este equipo</span></div>';
    return navigator.onLine
      ? '<div class="sync">' + UI.icon('cloud', 15) + '<span>Conectado · se sincroniza solo</span></div>'
      : '<div class="sync off">' + UI.icon('cloudoff', 15) + '<span>Sin conexión · se envía al volver</span></div>';
  }

  function renderChrome() {
    var dg = store.dg(), counts = navCounts(), v = store.state.view;
    var alertN = global.BPAPLUS.alerts ? global.BPAPLUS.alerts.count() : 0;
    var cur = NAV.filter(function (n) { return n.view === v; })[0] || NAV[0];
    var esc = UI.esc;
    function badge(c) { return c ? '<span class="ni-badge">' + c + '</span>' : ''; }
    function item(n) {
      var on = v === n.view;
      return '<button class="nav-item' + (on ? ' active' : '') + '" data-nav="' + n.view + '"' + (on ? ' aria-current="page"' : '') + '>' +
        UI.icon(n.icon, 18, 'ni-ico') + '<span>' + n.label + '</span>' + badge(counts[n.view]) + '</button>';
    }
    function group(name) {
      return '<div class="nav-label">' + name + '</div>' + NAV.filter(function (n) { return n.group === name; }).map(item).join('');
    }
    var avatar = '<span class="ws-av">' + esc(dg.init || '?') + '</span>';

    var side = document.getElementById('sidebar');
    if (side) side.innerHTML =
      '<button class="ws" id="dgSwitch" aria-label="Cambiar droguería">' + avatar +
        '<span class="ws-txt"><span class="ws-name">' + esc(dg.nombre) + '</span><span class="ws-ruc mono">' + (dg.ruc ? 'RUC ' + esc(dg.ruc) : 'Sin RUC') + '</span></span>' +
        UI.icon('updown', 16, 'ws-chev') + '</button>' +
      '<button class="side-search" id="cmdOpen">' + UI.icon('search', 16) + '<span>Buscar o ejecutar…</span><kbd class="mono">Ctrl K</kbd></button>' +
      '<nav class="nav" aria-label="Principal">' + item(NAV[0]) +
        '<button class="nav-item" id="alertBell">' + UI.icon('bell', 18, 'ni-ico') + '<span>Alertas</span>' + badge(alertN) + '</button>' +
        group('Cumplimiento') + group('Almacén') +
        '<div class="nav-label">Herramientas</div>' +
        '<button class="nav-item" id="driveImport">' + UI.icon('folder', 18, 'ni-ico') + '<span>Escanear carpeta BPA</span></button>' +
        '<button class="nav-item" id="cronImport">' + UI.icon('calendar', 18, 'ni-ico') + '<span>Importar cronograma</span></button>' +
      '</nav>' +
      '<div class="side-foot">' + syncChip() +
        '<button class="account" id="accountBtn"><span class="acc-av">' + UI.icon('user', 16) + '</span>' +
          '<span class="acc-txt"><b>Mi cuenta</b><small>PIN, tema, respaldo, salir</small></span>' + UI.icon('sliders', 16, 'acc-ico') + '</button>' +
      '</div>';

    /* Una sola barra superior: en escritorio muestra dónde estás; en el celular, la droguería.
       «Nuevo» reemplaza al botón flotante, que tapaba el final de cada lista. En escritorio solo
       aparece en Inicio: las demás vistas ya traen su propio botón de alta en el encabezado. */
    var top = document.getElementById('topbar');
    if (top) top.innerHTML =
      '<button class="tb-dg" id="dgSwitchM" aria-label="Cambiar droguería">' + avatar + '<span class="tb-dg-name">' + esc(dg.nombre) + '</span>' + UI.icon('chevron', 14) + '</button>' +
      '<nav class="crumbs" aria-label="Ubicación"><span>' + esc(dg.nombre) + '</span>' + (cur.group ? '<i>/</i><span>' + cur.group + '</span>' : '') + '<i>/</i><b>' + cur.label + '</b></nav>' +
      '<span class="tb-grow"></span>' +
      '<button class="icon-btn only-mobile" id="cmdOpenM" aria-label="Buscar">' + UI.icon('search', 20) + '</button>' +
      '<button class="icon-btn" id="alertBellM" aria-label="Alertas' + (alertN ? ' (' + alertN + ')' : '') + '">' + UI.icon('bell', 20) + (alertN ? '<span class="bell-badge">' + alertN + '</span>' : '') + '</button>' +
      '<button class="btn btn-primary tb-new' + (v === 'dashboard' ? '' : ' only-mobile') + '" id="newBtn" aria-label="Nuevo"' + (v === 'informacion-almacen' ? ' hidden' : '') + '>' +
        UI.icon('plus', 16) + '<span>Nuevo</span></button>';

    var bn = document.getElementById('bottomNav');
    var enMas = NAV.some(function (n) { return n.bottom === false && n.view === v; });
    if (bn) bn.innerHTML = '<div class="bn-inner">' + NAV.filter(function (n) { return n.bottom !== false; }).map(function (n) {
      var c = counts[n.view] || 0;
      return '<button class="bn-item' + (v === n.view ? ' active' : '') + '" data-nav="' + n.view + '">' +
        '<span class="bn-ico">' + UI.icon(n.icon, 20) + '</span><span>' + n.short + '</span>' + (c ? '<span class="bn-badge">' + c + '</span>' : '') + '</button>';
    }).join('') +
      '<button class="bn-item' + (enMas ? ' active' : '') + '" id="moreBtn"><span class="bn-ico">' + UI.icon('menu', 20) + '</span><span>Más</span></button></div>';

    wireChrome();
  }

  function on(id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; }
  function wireChrome() {
    document.querySelectorAll('[data-nav]').forEach(function (b) { b.onclick = function () { store.go(b.dataset.nav); }; });
    on('dgSwitch', function () { V.open.dgSwitcher(); });
    on('dgSwitchM', function () { V.open.dgSwitcher(); });
    on('cmdOpen', openCmd); on('cmdOpenM', openCmd);
    on('alertBell', openAlerts); on('alertBellM', openAlerts);
    on('driveImport', driveImport);
    on('cronImport', function () { importCronograma(); });
    on('accountBtn', function () { UI.actionsheet(accountOptions(), this); });
    on('moreBtn', function () {
      UI.actionsheet(NAV.filter(function (n) { return n.bottom === false; }).map(function (n) {
        return { label: n.label, icon: n.icon, onClick: function () { store.go(n.view); } };
      }).concat([
        { sep: true },
        { label: 'Escanear carpeta BPA', icon: 'folder', onClick: driveImport },
        { label: 'Importar cronograma', icon: 'calendar', onClick: function () { importCronograma(); } },
        { sep: true }
      ], accountOptions()), this);
    });
    on('newBtn', function () { quickNew(this); });
  }

  function openAlerts() { global.BPAPLUS.alerts.open(); }
  function logout() {
    var Auth = global.BPAPLUS.auth;
    if (Auth) Auth.signOut().then(function () { location.reload(); }); else location.reload();
  }
  function accountOptions() {
    return [
      { label: isDark() ? 'Tema claro' : 'Tema oscuro', icon: isDark() ? 'sun' : 'moon', onClick: toggleTheme },
      { label: 'Cambiar PIN', icon: 'settings', onClick: function () { global.BPAPLUS.lock.openSettings(); } },
      { sep: true },
      { label: 'Importar respaldo', icon: 'upload', onClick: importData },
      { label: 'Exportar respaldo', icon: 'download', onClick: exportData },
      { sep: true },
      { label: 'Cerrar sesión', icon: 'logout', danger: true, onClick: logout }
    ];
  }

  function driveImport() {
    global.BPAPLUS.drive.importPanel(function (drafts) {
      var nuevos = 0, actualizados = 0, fallidos = 0, ultimoError = '';
      var uploads = drafts.filter(function (d) { return d._file && !d.driveFileId; });
      function saveAll() {
        var prepareUpload = global.BPAPLUS.drive.prepareUpload || global.BPAPLUS.drive.prepararUpload;
        var canUpload = true, done = 0;
        var progress = UI.note('Guardando 0/' + drafts.length + ' documento(s)…', { duration: 600000 });
        (uploads.length && prepareUpload ? prepareUpload().catch(function (err) {
          canUpload = false; ultimoError = err && err.message || String(err);
        }) : Promise.resolve()).then(function () { return Promise.all(drafts.map(function (d) {
        var existing = d.existingId ? store.find('documentos', d.existingId) : null;
        var file = d._file;
        var clean = Object.assign({}, d); delete clean.existingId;
        /* Todo lo que el escaneo usó para sí mismo va con guion bajo y no se guarda. */
        Object.keys(clean).forEach(function (k) { if (k.charAt(0) === '_') delete clean[k]; });
        var obj = existing ? Object.assign({}, existing, clean, { id: existing.id }) : Object.assign({ id: D.nextId(), e: store.dg().id, area: 'Almacén', version: 1 }, clean);
        var unchanged = existing && existing.file && clean.modifiedTime && existing.modifiedTime === clean.modifiedTime;
        if (d.driveFileId) obj.file = {
          driveId: d.driveFileId, name: d._fileName || d.nombre, originalName: d._fileName || d.nombre,
          size: file && file.size || 0, contentType: file && file.type || '', driveUrl: d.driveUrl
        };
        var needsUpload = file && !d.driveFileId && !unchanged;
        if (needsUpload && !canUpload) fallidos++;
        var ready = needsUpload && canUpload ? global.BPAPLUS.drive.storeFile(store.dg().id, obj, file, clean.role, clean.version) : Promise.resolve(obj);
        return ready.catch(function (err) {
          fallidos++; ultimoError = err && err.message || String(err); return obj;
        }).then(function (saved) { return store.save('documentos', saved); })
          .then(function () {
            if (existing) actualizados++; else nuevos++;
            progress.querySelector('span').textContent = 'Guardando ' + (++done) + '/' + drafts.length + ' documento(s)…';
          });
      })); }).then(function () { progress.remove(); UI.note(nuevos + ' nuevo(s), ' + actualizados + ' actualizado(s)' + (fallidos ? ', ' + fallidos + ' sin archivo: ' + ultimoError : '') + ' en la biblioteca', { duration: fallidos ? 10000 : 4000 }); })
          .catch(function (err) { UI.note('No se pudieron subir los archivos: ' + (err && err.message || err)); });
      }
      if (uploads.length && !global.BPAPLUS.drive.getClientId()) return global.BPAPLUS.drive.connectPanel(saveAll);
      saveAll();
    }, store.byDg('documentos'));
  }

  /* Un solo camino para importar el cronograma; lo llaman la barra lateral y los
     botones de Capacitaciones y Autoinspecciones. kindHint dice qué es la hoja
     cuando ni su nombre ni su contenido lo aclaran. */
  function importCronograma(kindHint) {
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
    }, store.byDg('capacitaciones'), store.byDg('inspecciones'), kindHint);
  }

  /* ------------------------------ Tema ------------------------------ */
  var THEME_KEY = 'bpa-plus-theme-v2';
  function isDark() { return document.documentElement.classList.contains('dark'); }
  function applyTheme(t) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    var meta = document.getElementById('themeColor');
    if (meta) meta.content = t === 'dark' ? '#0F151C' : '#F3F1EB';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function toggleTheme() { applyTheme(isDark() ? 'light' : 'dark'); renderChrome(); }

  /* ------------------------------ Respaldo ------------------------------ */
  function exportData() {
    DB.exportAll().then(function (data) {
      UI.download('bpa-plus-respaldo-' + D.isoHoy() + '.json', data);
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
    idx.push({ type: 'Acción', name: 'Descargar formato de acta', run: function () { V.open.formatoActa(); } });
    idx.push({ type: 'Acción', name: 'Cargar acta llenada', run: function () { V.open.cargarActa(); } });
    idx.push({ type: 'Acción', name: 'Exportar respaldo', run: exportData });
    idx.push({ type: 'Acción', name: 'Importar respaldo', run: importData });
    idx.push({ type: 'Acción', name: 'Escanear carpeta BPA', run: driveImport });
    idx.push({ type: 'Acción', name: 'Importar cronograma', run: function () { importCronograma(); } });
    idx.push({ type: 'Acción', name: 'Cambiar tema claro/oscuro', run: toggleTheme });
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

  /* ------------------------------ «Nuevo» (barra superior) ------------------------------ */
  function quickNew(anchor) {
    var v = store.state.view;
    if (v === 'documentos') return V.open.docForm(null);
    if (v === 'documentos-inspeccion') return V.open.documentoInspeccion();
    if (v === 'capacitaciones') return V.open.capForm(null);
    if (v === 'retiros') return global.BPAPLUS.retiro.form(null);
    if (v === 'autoinspecciones') return UI.actionsheet([
      { label: 'Nueva acta de inspección', icon: 'clipboard', onClick: function () { V.open.actaForm(null); } },
      { label: 'Programar autoinspección', icon: 'calendar', onClick: function () { V.open.inspForm(null); } }
    ], anchor);
    UI.actionsheet([
      { label: 'Nuevo documento', icon: 'doc', onClick: function () { V.open.docForm(null); } },
      { label: 'Nueva capacitación', icon: 'cap', onClick: function () { V.open.capForm(null); } },
      { label: 'Nueva acta de inspección', icon: 'clipboard', onClick: function () { V.open.actaForm(null); } },
      { label: 'Programar autoinspección', icon: 'calendar', onClick: function () { V.open.inspForm(null); } },
      { label: 'Simulacro de retiro', icon: 'flag', onClick: function () { global.BPAPLUS.retiro.form(null); } }
    ], anchor);
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
      window.addEventListener('online', renderChrome);
      window.addEventListener('offline', renderChrome);

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
