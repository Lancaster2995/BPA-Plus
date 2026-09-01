/* ==========================================================================
   BPA-Plus — views.js
   Renderizado e interacción de cada pantalla (Panorama, Documentos,
   Capacitaciones, Autoinspecciones) y sus formularios/paneles.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, UI = global.BPAPLUS.ui, esc = UI.esc, icon = UI.icon, tag = UI.tag;
  var store; // inyectado por app.js
  var actas = global.BPAPLUS.actas;

  var AREAS = ['Almacén', 'Calidad', 'Aseguramiento de la calidad', 'Dirección Técnica', 'Administración', 'Otra'];
  var TIPOS = ['POE', 'Formato', 'Instructivo', 'Registro', 'Manual', 'Política', 'Otro'];
  var FRECS = ['Única', 'Trimestral', 'Semestral', 'Anual', 'Según necesidad'];

  function opts(list, sel) { return list.map(function (o) { return '<option ' + (o === sel ? 'selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }

  /* ===================================================================== *
   *  PANORAMA (dashboard)
   * ===================================================================== */
  function vDashboard() {
    var docs = store.byDg('documentos'), caps = store.byDg('capacitaciones'), insp = store.byDg('inspecciones');
    var sc = D.scoreCumplimiento(docs, caps, insp);
    var dV = docs.filter(function (d) { return D.edoc(d) === 'vencido'; }).length;
    var dPV = docs.filter(function (d) { return D.edoc(d) === 'por_vencer'; }).length;
    var cPend = caps.filter(function (c) { var e = D.ecap(c); return e === 'pendiente' || e === 'vencida'; }).length;
    var cV = caps.filter(function (c) { return D.ecap(c) === 'vencida'; }).length;
    var hall = insp.reduce(function (a, i) { return a + (i.real ? (i.hall || 0) : 0); }, 0);
    var proxI = insp.filter(function (i) { return !i.real; }).sort(function (a, b) { return D.dias(a.prog) - D.dias(b.prog); })[0];

    var evs = []
      .concat(docs.map(function (d) { return { tipo: 'Documento', nombre: d.codigo + ' · ' + d.nombre, fecha: d.rev, est: D.edoc(d) }; }))
      .concat(caps.filter(function (c) { return D.ecap(c) !== 'realizada'; }).map(function (c) {
        return { tipo: 'Capacitación', nombre: c.tema, fecha: c.fecha, est: D.ecap(c) === 'vencida' ? 'vencido' : (D.dias(c.fecha) <= 30 ? 'por_vencer' : 'vigente') };
      }))
      .concat(insp.filter(function (i) { return !i.real; }).map(function (i) {
        return { tipo: 'Inspección', nombre: i.area, fecha: i.prog, est: D.dias(i.prog) < 0 ? 'vencido' : (D.dias(i.prog) <= 30 ? 'por_vencer' : 'vigente') };
      }))
      .sort(function (a, b) { return D.dias(a.fecha) - D.dias(b.fecha); });

    var C = 2 * Math.PI * 50, off = C * (1 - sc.score / 100);
    var ticks = ''; for (var t = 0; t < 24; t++) { var a = (t / 24) * Math.PI * 2 - Math.PI / 2; ticks += '<line x1="' + (60 + 56 * Math.cos(a)) + '" y1="' + (60 + 56 * Math.sin(a)) + '" x2="' + (60 + 60 * Math.cos(a)) + '" y2="' + (60 + 60 * Math.sin(a)) + '" />'; }

    return '' +
      '<div class="view-header"><div>' +
        '<div class="view-title">Panorama</div>' +
        '<div class="view-sub">Buenas Prácticas de Almacenamiento · ' + esc(store.dg().nombre) + '</div>' +
      '</div>' +
      '<button class="btn btn-secondary btn-sm" data-action="export">' + icon('download', 16) + 'Exportar</button>' +
      '</div>' +

      '<div class="beacon-card">' +
        '<div class="beacon-wrap"><svg viewBox="0 0 120 120" class="beacon-svg">' +
          '<g class="beacon-ticks">' + ticks + '</g>' +
          '<circle class="beacon-bg" cx="60" cy="60" r="50"></circle>' +
          '<circle class="beacon-fg ' + sc.cls + '" cx="60" cy="60" r="50" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"></circle>' +
        '</svg><div class="beacon-center"><div class="beacon-num ' + sc.cls + '">' + sc.score + '%</div><div class="beacon-lbl">Cumplimiento</div></div></div>' +
        '<div class="beacon-info"><div class="beacon-msg ' + sc.cls + '">' + sc.msg + '</div>' +
          '<div class="beacon-break">' +
            '<span><i class="bk-dot doc"></i><b>' + sc.docsOK + '</b>/' + sc.docsTot + ' documentos al día</span>' +
            '<span><i class="bk-dot cap"></i><b>' + sc.capsOK + '</b>/' + sc.capsTot + ' capacitaciones al día</span>' +
            '<span><i class="bk-dot insp"></i><b>' + sc.inspOK + '</b>/' + sc.inspTot + ' inspecciones al día</span>' +
          '</div></div>' +
      '</div>' +

      '<div class="stats">' +
        statCard('documentos', dV > 0 ? 'crit' : 'doc', 'doc', dV, 'Documentos vencidos', dPV + ' por vencer', dV > 0) +
        statCard('capacitaciones', cV > 0 ? 'crit' : 'cap', 'cap', cPend, 'Capacitaciones pendientes', cV + ' vencidas', cV > 0) +
        statCard('autoinspecciones', hall > 0 ? 'crit' : 'insp', 'insp', hall, 'Hallazgos abiertos', proxI ? ('Próxima: ' + esc(proxI.area)) : 'Sin pendientes', hall > 0) +
      '</div>' +

      '<div class="section-title">Próximos vencimientos</div>' +
      (evs.length ? '<div class="timeline">' + evs.slice(0, 8).map(function (e) {
        var f = D.fDias(D.dias(e.fecha));
        return '<div class="tl-row"><span class="tl-dot ' + e.est + '"></span>' +
          '<div class="tl-mid"><div class="tl-type">' + esc(e.tipo) + '</div><div class="tl-name">' + esc(e.nombre) + '</div></div>' +
          '<span class="days ' + f.cls + '">' + f.txt + '</span></div>';
      }).join('') + '</div>'
      : emptyState('check', 'Todo al día', 'No hay vencimientos próximos para esta droguería.'));
  }

  function statCard(goto, icoCls, ch, val, label, detail, crit) {
    return '<button class="stat" data-goto="' + goto + '">' +
      '<div class="stat-ico ' + icoCls + '">' + icon(ch === 'doc' ? 'doc' : ch === 'cap' ? 'cap' : 'insp', 18) + '</div>' +
      '<div class="stat-val ' + (crit ? 'crit' : '') + '">' + val + '</div>' +
      '<div class="stat-label">' + esc(label) + '</div><div class="stat-detail">' + esc(detail) + '</div></button>';
  }

  function emptyState(ico, title, sub, actionHtml) {
    return '<div class="empty">' + icon(ico, 40, 'es-ico') +
      '<span class="es-title">' + esc(title) + '</span>' +
      '<span class="es-sub">' + esc(sub) + '</span>' + (actionHtml || '') + '</div>';
  }

  function filterPills(current, list, attr) {
    return '<div class="pills">' + list.map(function (o) {
      return '<button class="pill ' + (current === o.v ? 'active' : '') + '" ' + attr + '="' + o.v + '">' +
        esc(o.l) + (o.c != null ? ' <span class="pcount">' + o.c + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  /* ===================================================================== *
   *  DOCUMENTOS
   * ===================================================================== */
  function vDocumentos() {
    var S = store.state;
    var all = store.byDg('documentos');
    var docs = all.slice();
    if (S.qDoc) { var q = S.qDoc.toLowerCase(); docs = docs.filter(function (d) { return (d.codigo + ' ' + d.nombre + ' ' + d.area).toLowerCase().includes(q); }); }
    if (S.filtDoc !== 'todos') docs = docs.filter(function (d) { return D.edoc(d) === S.filtDoc; });

    var crit = store.dg().criterios || D.CRITERIOS_DEFAULT;
    var cats = crit.concat([D.MISC_LABEL]);
    var grupos = {}; cats.forEach(function (c) { grupos[c] = []; });
    docs.forEach(function (d) { var c = criterioDeDoc(d, crit); (grupos[c] || (grupos[c] = [])).push(d); });
    Object.keys(grupos).forEach(function (k) {
      grupos[k].sort(function (a, b) {
        var na = D.numeroEnNombre(a.codigo || a.nombre), nb = D.numeroEnNombre(b.codigo || b.nombre);
        return na !== nb ? na - nb : (a.codigo || '').localeCompare(b.codigo || '');
      });
    });

    var counts = {
      todos: all.length,
      vigente: all.filter(function (d) { return D.edoc(d) === 'vigente'; }).length,
      por_vencer: all.filter(function (d) { return D.edoc(d) === 'por_vencer'; }).length,
      vencido: all.filter(function (d) { return D.edoc(d) === 'vencido'; }).length
    };

    var body = cats.map(function (cat) {
      var lista = grupos[cat]; if (!lista || !lista.length) return '';
      return '<div class="section-title" style="margin-top:18px">' + esc(cat) + ' <span class="section-count">· ' + lista.length + '</span></div>' +
        '<div class="list">' + lista.map(docRow).join('') + '</div>';
    }).join('');

    return '' +
      '<div class="view-header"><div><div class="view-title">Documentos</div>' +
        '<div class="view-sub">' + all.length + ' documento(s) · ' + esc(store.dg().nombre) + '</div></div>' +
        '<button class="btn btn-primary" data-action="nuevo-doc">' + icon('plus', 16) + 'Nuevo</button></div>' +
      '<div class="toolbar"><div class="search-input">' + icon('search', 16) +
        '<input type="text" id="qDoc" placeholder="Buscar por código, nombre o área…" value="' + esc(S.qDoc) + '" aria-label="Buscar documentos"></div></div>' +
      filterPills(S.filtDoc, [
        { v: 'todos', l: 'Todos', c: counts.todos }, { v: 'vigente', l: 'Vigentes', c: counts.vigente },
        { v: 'por_vencer', l: 'Por vencer', c: counts.por_vencer }, { v: 'vencido', l: 'Vencidos', c: counts.vencido }
      ], 'data-fdoc') +
      (docs.length ? body : emptyState('doc', 'Sin documentos', all.length ? 'Ningún documento coincide con el filtro.' : 'Agregá tu primer POE, formato o instructivo.',
        all.length ? '' : '<button class="btn btn-primary" data-action="nuevo-doc">' + icon('plus', 16) + 'Nuevo documento</button>'));
  }

  function criterioDeDoc(d, crit) {
    var t = D.normTxt(d.tipo || '');
    if (t) {
      for (var i = 0; i < crit.length; i++) {
        var c = D.normTxt(crit[i]);
        if (c === t || c.indexOf(t) === 0 || t.indexOf(c) === 0) return crit[i];
      }
    }
    return D.clasificarPorCriterio(d.codigo + ' ' + d.nombre, crit);
  }

  function docRow(d) {
    var e = D.edoc(d), f = D.fDias(D.dias(d.rev));
    return '<div class="row" data-doc="' + d.id + '"><div class="row-top"><div class="chan doc"></div><div class="row-main">' +
      '<div class="row-code mono">' + esc(d.codigo) + ' · v' + esc(d.version) + '</div>' +
      '<div class="row-name">' + esc(d.nombre) + '</div>' +
      '<div class="row-meta"><span><b>Área</b>' + esc(d.area) + '</span><span><b>Tipo</b>' + esc(d.tipo) + '</span>' +
      '<span><b>Rev.</b>' + esc(D.fLocal(d.rev)) + '</span></div></div>' +
      '<div class="row-side">' + tag(e) + '<span class="days ' + f.cls + '">' + f.txt + '</span></div></div></div>';
  }

  function docForm(existing) {
    var d = existing || { codigo: '', nombre: '', area: 'Almacén', tipo: 'POE', version: 1, rev: D.isoDesdeHoy(365) };
    var m = UI.dialog({
      title: existing ? 'Editar documento' : 'Nuevo documento',
      body:
        '<div class="grid-2"><div class="field" id="wrap_codigo"><label>Código estándar</label><input class="inp mono" id="f_cod" value="' + esc(d.codigo) + '" placeholder="POE-ALM-001"><div class="err">Usa un código como POE-ALM-001 o FOR-ALM-011.</div></div>' +
        '<div class="field"><label>Versión</label><input class="inp mono" id="f_ver" type="number" min="1" value="' + esc(d.version) + '"></div></div>' +
        '<div class="field" id="wrap_nombre"><label>Nombre del documento</label><input class="inp" id="f_nom" value="' + esc(d.nombre) + '" placeholder="Recepción de productos"><div class="err">Ingresá un nombre.</div></div>' +
        '<div class="grid-2"><div class="field"><label>Área</label><select class="inp" id="f_area">' + opts(AREAS, d.area) + '</select></div>' +
        '<div class="field"><label>Tipo</label><select class="inp" id="f_tipo">' + opts(TIPOS, d.tipo) + '</select></div></div>' +
        '<div class="field"><label>Fecha de próxima revisión / vencimiento</label><input class="inp" id="f_rev" type="date" value="' + esc(d.rev) + '">' +
        '<div class="hint">El estado (vigente / por vencer / vencido) se calcula solo a partir de esta fecha.</div></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="f_save">Guardar</button>',
      onMount: function (root) {
        root.querySelector('#f_save').onclick = function () {
          var nom = root.querySelector('#f_nom').value.trim();
          if (!nom) { root.querySelector('#wrap_nombre').classList.add('invalid'); root.querySelector('#f_nom').focus(); return; }
          var code = global.BPAPLUS.drive.normalizeCode(root.querySelector('#f_cod').value);
          if (!global.BPAPLUS.drive.isStandardCode(code)) { root.querySelector('#wrap_codigo').classList.add('invalid'); root.querySelector('#f_cod').focus(); return; }
          var obj = Object.assign({}, existing || {}, {
            id: existing ? existing.id : D.nextId(), e: store.dg().id,
            codigo: code,
            nombre: nom, area: root.querySelector('#f_area').value,
            tipo: root.querySelector('#f_tipo').value,
            version: +root.querySelector('#f_ver').value || 1,
            rev: root.querySelector('#f_rev').value || D.isoHoy()
          });
          store.save('documentos', obj).then(function () { m.close(); UI.note(existing ? 'Documento actualizado' : 'Documento agregado'); });
        };
      }
    });
  }

  function docPanel(d) {
    var e = D.edoc(d), f = D.fDias(D.dias(d.rev));
    var history = d.history || [], records = d.records || [];
    var files = (d.templateMissing ? '<div class="file-warning">Falta cargar la plantilla vacía oficial.</div>' : '') +
      (d.file ? '<button class="file-item" data-file-current>' + icon('download', 15) + '<span><b>Archivo vigente</b><small>' + esc(d.file.name) + '</small></span></button>' : '<div class="row-empty">Sin archivo vigente.</div>') +
      (history.length ? '<div class="section-title">Versiones anteriores (' + history.length + ')</div>' + history.map(function (file, i) {
        return '<button class="file-item" data-file-history="' + i + '">' + icon('download', 15) + '<span><b>Versión archivada</b><small>' + esc(file.name) + '</small></span></button>';
      }).join('') : '') +
      (records.length ? '<div class="section-title">Formatos llenados (' + records.length + ')</div>' + records.map(function (file, i) {
        return '<button class="file-item" data-file-record="' + i + '">' + icon('download', 15) + '<span><b>Registro</b><small>' + esc(file.name) + '</small></span></button>';
      }).join('') : '');
    UI.panel({
      title: 'Documento',
      body:
        '<div class="panel-lead"><div><div class="row-code mono">' + esc(d.codigo) + ' · v' + esc(d.version) + '</div>' +
        '<div class="panel-lead-title">' + esc(d.nombre) + '</div></div>' + tag(e) + '</div>' +
        detailRow('Área', d.area) + detailRow('Tipo', d.tipo) +
        detailRow('Próxima revisión', D.fLocal(d.rev) + ' · ' + f.txt) +
        detailRow('Clasificación', criterioDeDoc(d, store.dg().criterios || D.CRITERIOS_DEFAULT)) +
        '<div class="section-title">Biblioteca documental</div><div class="file-list">' + files + '</div>' +
        '<button class="btn btn-primary btn-sm" data-file-upload style="margin-top:12px">' + icon('upload', 14) + (d.file ? 'Reemplazar / archivar registro' : 'Cargar archivo') + '</button>' +
        (d.driveUrl
          ? '<div class="drive-linked"><span>' + icon('doc', 15) + 'Vinculado a Google Drive</span><a href="' + d.driveUrl + '" target="_blank" rel="noopener" class="link-btn">Abrir original</a></div>'
          : '<button class="btn btn-ghost btn-sm" data-drivelink style="margin-top:12px">' + icon('upload', 14) + 'Vincular a Google Drive</button>'),
      footer:
        '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
        '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>',
      onMount: function (root) {
        root.querySelector('[data-edit]').onclick = function () { root.querySelector('[data-close]').click(); docForm(d); };
        root.querySelector('[data-del]').onclick = function () { root.querySelector('[data-close]').click(); store.removeWithUndo('documentos', d, 'Documento eliminado'); };
        var dl = root.querySelector('[data-drivelink]');
        if (dl) dl.onclick = function () {
          global.BPAPLUS.drive.linkPanel(d, function (link) { store.save('documentos', Object.assign({}, d, link)); });
        };
        var current = root.querySelector('[data-file-current]');
        function download(file) { global.BPAPLUS.drive.downloadStored(file).catch(function (error) { UI.note(error.message || error); }); }
        if (current) current.onclick = function () { download(d.file); };
        root.querySelectorAll('[data-file-history]').forEach(function (button) { button.onclick = function () { download(history[+button.dataset.fileHistory]); }; });
        root.querySelectorAll('[data-file-record]').forEach(function (button) { button.onclick = function () { download(records[+button.dataset.fileRecord]); }; });
        root.querySelector('[data-file-upload]').onclick = function () {
          root.querySelector('[data-close]').click();
          global.BPAPLUS.drive.filePanel(d, store.dg().id, function (saved) { return store.save('documentos', saved); });
        };
      }
    });
  }

  function detailRow(k, v) {
    return '<div class="detail-row"><span class="detail-k">' + esc(k) + '</span><span class="detail-v">' + esc(v) + '</span></div>';
  }

  /* ===================================================================== *
   *  CAPACITACIONES
   * ===================================================================== */
  function vCapacitaciones() {
    var S = store.state;
    var all = store.byDg('capacitaciones');
    var caps = all.slice();
    if (S.filtCap !== 'todos') caps = caps.filter(function (c) { return D.ecap(c) === S.filtCap; });
    caps.sort(function (a, b) { return D.dias(a.fecha) - D.dias(b.fecha); });

    var real = all.filter(function (c) { return D.ecap(c) === 'realizada'; }).length;
    var pct = all.length ? Math.round(real / all.length * 100) : 0;
    var counts = {
      todos: all.length, pendiente: all.filter(function (c) { return D.ecap(c) === 'pendiente'; }).length,
      realizada: real, vencida: all.filter(function (c) { return D.ecap(c) === 'vencida'; }).length
    };

    return '' +
      '<div class="view-header"><div><div class="view-title">Capacitaciones</div>' +
        '<div class="view-sub">' + real + ' de ' + all.length + ' realizadas · ' + esc(store.dg().nombre) + '</div></div>' +
        '<div class="header-actions">' +
          '<button class="btn btn-ghost" data-action="fmt-cap">' + icon('settings', 16) + 'Formato propio</button>' +
          '<button class="btn btn-ghost" data-action="cron-cap">' + icon('upload', 16) + 'Importar cronograma</button>' +
          '<button class="btn btn-primary" data-action="nueva-cap">' + icon('plus', 16) + 'Nueva</button></div></div>' +
      '<div class="progress" style="margin-bottom:14px"><div class="progress-top"><span>Avance del programa anual</span><strong>' + pct + '%</strong></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>' +
      filterPills(S.filtCap, [
        { v: 'todos', l: 'Todas', c: counts.todos }, { v: 'pendiente', l: 'Pendientes', c: counts.pendiente },
        { v: 'realizada', l: 'Realizadas', c: counts.realizada }, { v: 'vencida', l: 'Vencidas', c: counts.vencida }
      ], 'data-fcap') +
      (caps.length ? '<div class="list">' + caps.map(capRow).join('') + '</div>'
        : emptyState('cap', 'Sin capacitaciones', all.length ? 'Ninguna capacitación coincide con el filtro.' : 'Programá tu primera capacitación del año.',
          all.length ? '' : '<button class="btn btn-primary" data-action="nueva-cap">' + icon('plus', 16) + 'Nueva capacitación</button>' +
            '<button class="btn btn-ghost" data-action="cron-cap">' + icon('upload', 16) + 'Importar cronograma</button>'));
  }

  function capRow(c) {
    var e = D.ecap(c), f = D.fDias(D.dias(c.fecha));
    var sub = e === 'realizada'
      ? '<span class="days ok">Realizada · ' + esc(D.fLocal(c.fecha)) + '</span>'
      : '<span class="row-plain">Programada: ' + esc(D.fLocal(c.fecha)) + '</span> <span class="days ' + f.cls + '">' + f.txt + '</span>';
    var np = (c.capacitados || []).length;
    return '<div class="row" data-cap="' + c.id + '"><div class="row-top"><div class="chan cap"></div><div class="row-main">' +
      '<div class="row-name">' + esc(c.tema) + '</div>' +
      '<div class="row-meta"><span>' + esc(c.area) + ' · ' + esc(c.frec) + '</span>' + (np ? '<span><b>Participantes</b>' + np + '</span>' : '') + '</div>' +
      '<div class="row-sub">' + sub + '</div></div>' + tag(e) + '</div>' +
      '<div class="row-foot">' +
        (e === 'realizada'
          ? '<button class="link-btn" data-capdone="' + c.id + '" data-to="pendiente">↺ Volver a pendiente</button>'
          : '<button class="link-btn" data-capdone="' + c.id + '" data-to="realizada">' + icon('check', 14) + ' Marcar realizada</button>') +
        '<button class="link-btn" data-capacta="' + c.id + '">' + icon('print', 14) + ' Acta de asistencia</button>' +
      '</div></div>';
  }

  function capForm(existing) {
    var c = existing || { tema: '', area: 'Almacén', frec: 'Anual', fecha: D.isoDesdeHoy(30), capacitados: [] };
    var attHtml = (c.capacitados || []).map(attRow).join('');
    var m = UI.dialog({
      title: existing ? 'Editar capacitación' : 'Nueva capacitación', wide: true,
      body:
        '<div class="field" id="wrap_tema"><label>Tema</label><input class="inp" id="c_tema" value="' + esc(c.tema) + '" placeholder="Inducción en BPA"><div class="err">Ingresá un tema.</div></div>' +
        '<div class="grid-2"><div class="field"><label>Área</label><select class="inp" id="c_area">' + opts(AREAS, c.area) + '</select></div>' +
        '<div class="field"><label>Frecuencia</label><select class="inp" id="c_frec">' + opts(FRECS, c.frec) + '</select></div></div>' +
        '<div class="field"><label>Fecha programada</label><input class="inp" id="c_fecha" type="date" value="' + esc(c.fecha) + '"></div>' +
        '<div class="field"><label>Material de la capacitación</label>' +
          '<input class="inp" id="c_material" type="file" accept=".pdf,.docx,.xlsx,.pptx">' +
          '<div class="hint">' + ((c.materiales || []).length ? (c.materiales.length + ' archivo(s) ya cargado(s). ') : '') +
            'PDF, Word, Excel o PowerPoint de menos de 25 MB.</div></div>' +
        '<div class="field"><label>Participantes</label><div id="attList">' + attHtml + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="c_add" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar participante</button></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="c_save">Guardar</button>',
      onMount: function (root) {
        var list = root.querySelector('#attList');
        root.querySelector('#c_add').onclick = function () { var div = document.createElement('div'); div.innerHTML = attRow({ nombre: '', cargo: '' }); list.appendChild(div.firstChild); };
        list.addEventListener('click', function (e) { var b = e.target.closest('[data-delatt]'); if (b) b.closest('.mini-row').remove(); });
        root.querySelector('#c_save').onclick = function () {
          var tema = root.querySelector('#c_tema').value.trim();
          if (!tema) { root.querySelector('#wrap_tema').classList.add('invalid'); root.querySelector('#c_tema').focus(); return; }
          var att = Array.prototype.map.call(list.querySelectorAll('.mini-row'), function (r) {
            return { nombre: r.querySelector('.att-nom').value.trim(), cargo: r.querySelector('.att-cargo').value.trim() };
          }).filter(function (a) { return a.nombre; });
          var obj = Object.assign({}, existing || {}, {
            id: existing ? existing.id : D.nextId(), e: store.dg().id,
            tema: tema, area: root.querySelector('#c_area').value, frec: root.querySelector('#c_frec').value,
            fecha: root.querySelector('#c_fecha').value || D.isoHoy(),
            est: existing ? existing.est : 'pendiente', capacitados: att,
            materiales: (existing && existing.materiales) || []
          });
          var mat = root.querySelector('#c_material').files[0];
          if (mat && mat.size >= 25 * 1024 * 1024) { UI.note('El material debe pesar menos de 25 MB.'); return; }
          var btn = root.querySelector('#c_save'); btn.disabled = true;
          var subida = mat
            ? global.BPAPLUS.drive.storeMaterial(store.dg().id, obj.id, mat)
                .then(function (meta) { obj.materiales = obj.materiales.concat(meta); })
            : Promise.resolve();
          subida.then(function () { return store.save('capacitaciones', obj); })
            .then(function () { m.close(); UI.note(existing ? 'Capacitación actualizada' : 'Capacitación agregada'); })
            .catch(function (err) { btn.disabled = false; UI.note('No se pudo subir el material: ' + (err && err.message || err)); });
        };
      }
    });
  }
  function attRow(p) {
    return '<div class="mini-row"><input class="inp att-nom" placeholder="Nombre y apellidos" value="' + esc(p.nombre || '') + '">' +
      '<input class="inp att-cargo" placeholder="Cargo" value="' + esc(p.cargo || '') + '" style="max-width:150px">' +
      '<button class="icon-btn del" type="button" data-delatt aria-label="Quitar">' + icon('x', 16) + '</button></div>';
  }

  function capPanel(c) {
    var e = D.ecap(c);
    var att = (c.capacitados || []), mats = (c.materiales || []);
    UI.panel({
      title: 'Capacitación',
      body:
        '<div class="panel-lead"><div class="panel-lead-title">' + esc(c.tema) + '</div>' + tag(e) + '</div>' +
        detailRow('Área', c.area) + detailRow('Frecuencia', c.frec) + detailRow('Fecha programada', D.fLocal(c.fecha)) +
        '<div class="section-title">Material (' + mats.length + ')</div>' +
        (mats.length ? '<div class="file-list">' + mats.map(function (f, i) {
          return '<button class="file-item" data-mat="' + i + '">' + icon('doc', 16) +
            '<span><b>' + esc(f.name || 'archivo') + '</b><small>Descargar</small></span></button>';
        }).join('') + '</div>' : '<div class="row-empty">Sin material cargado. Editá la capacitación para subirlo.</div>') +
        '<div class="section-title">Participantes (' + att.length + ')</div>' +
        (att.length ? att.map(function (p) { return '<div class="att-item"><div class="att-nombre">' + esc(p.nombre) + '</div><div class="att-cargo">' + esc(p.cargo || '—') + '</div></div>'; }).join('')
          : '<div class="row-empty">Sin participantes registrados.</div>'),
      footer:
        '<button class="btn btn-ghost" data-acta>' + icon('print', 16) + 'Acta</button>' +
        '<button class="btn btn-ghost" data-eval>' + icon('check', 16) + 'Evaluación</button>' +
        '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
        '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>',
      onMount: function (root) {
        root.querySelector('[data-acta]').onclick = function () { actas.actaAsistencia(store.dg(), c); };
        root.querySelectorAll('[data-mat]').forEach(function (b) {
          b.onclick = function () {
            global.BPAPLUS.drive.downloadStored(mats[+b.dataset.mat]).catch(function (e) { UI.note(e.message || e); });
          };
        });
        root.querySelector('[data-eval]').onclick = function () { root.querySelector('[data-close]').click(); evalPanel(c); };
        root.querySelector('[data-edit]').onclick = function () { root.querySelector('[data-close]').click(); capForm(c); };
        root.querySelector('[data-del]').onclick = function () { root.querySelector('[data-close]').click(); store.removeWithUndo('capacitaciones', c, 'Capacitación eliminada'); };
      }
    });
  }

  /* Evaluación de la capacitación: 5 preguntas de alternativa múltiple que
     genera el backend a partir del tema y del material cargado. Se guarda en
     la capacitación, así que se regenera solo cuando lo pedís. */
  function evalPanel(c) {
    var LETRAS = ['A', 'B', 'C', 'D'];
    function preguntasHtml(ev) {
      return ev.preguntas.map(function (p, i) {
        return '<div class="ev-item"><div class="ev-q"><b>' + (i + 1) + '.</b> ' + esc(p.enunciado) + '</div>' +
          '<div class="ev-ops">' + p.opciones.map(function (o, j) {
            return '<div class="ev-op' + (j === p.correcta ? ' ok' : '') + '"><span>' + LETRAS[j] + '</span>' + esc(o) + '</div>';
          }).join('') + '</div>' +
          '<div class="ev-just">' + esc(p.justificacion) + '</div></div>';
      }).join('');
    }
    var m = UI.panel({
      title: 'Evaluación de la capacitación',
      body: '<div class="panel-lead"><div class="panel-lead-title">' + esc(c.tema) + '</div></div>' +
        '<div id="ev_body">' + (c.evaluacion
          ? '<p class="dialog-note">Generada el ' + esc(D.fLocal(new Date(c.evaluacion.generadoEl).toISOString().slice(0, 10))) +
              (c.evaluacion.conMaterial ? ' a partir del material cargado.' : ' a partir del tema (sin material adjunto).') +
              ' La respuesta correcta va marcada; al imprimir sale en blanco.</p>' + preguntasHtml(c.evaluacion)
          : '<div class="row-empty">Todavía no hay evaluación. Se generan 5 preguntas de alternativa múltiple con el tema y, si cargaste material, con su contenido.</div>') + '</div>',
      footer:
        '<button class="btn btn-primary" data-gen>' + icon('cap', 16) + (c.evaluacion ? 'Regenerar' : 'Generar evaluación') + '</button>' +
        (c.evaluacion ? '<button class="btn btn-ghost" data-print>' + icon('print', 16) + 'Imprimir</button>' : ''),
      onMount: function (root) {
        var pr = root.querySelector('[data-print]');
        if (pr) pr.onclick = function () { actas.actaEvaluacion(store.dg(), c); };
        root.querySelector('[data-gen]').onclick = function () {
          var btn = root.querySelector('[data-gen]'), box = root.querySelector('#ev_body');
          btn.disabled = true; btn.textContent = 'Leyendo el material…';
          var mats = c.materiales || [];
          var texto = mats.length ? global.BPAPLUS.drive.textoDeArchivo(mats[mats.length - 1]) : Promise.resolve('');
          texto.then(function (material) {
            btn.textContent = 'Redactando las preguntas…';
            return global.BPAPLUS.cloud.callFn('generarEvaluacion', { tema: c.tema, area: c.area, material: material });
          }).then(function (ev) {
            box.innerHTML = preguntasHtml(ev);
            return store.save('capacitaciones', Object.assign({}, c, { evaluacion: ev }));
          }).then(function () {
            m.close(); UI.note('Evaluación lista'); evalPanel(store.find('capacitaciones', c.id));
          }).catch(function (err) {
            btn.disabled = false; btn.textContent = c.evaluacion ? 'Regenerar' : 'Generar evaluación';
            UI.note(err && err.message || 'No se pudo generar la evaluación.');
          });
        };
      }
    });
  }

  /* ===================================================================== *
   *  AUTOINSPECCIONES
   * ===================================================================== */
  function vAutoinspecciones() {
    var S = store.state;
    var all = store.byDg('inspecciones');
    var insp = all.slice();
    if (S.filtInsp === 'realizadas') insp = insp.filter(function (i) { return !!i.real; });
    else if (S.filtInsp === 'pendientes') insp = insp.filter(function (i) { return !i.real; });
    insp.sort(function (a, b) { return D.dias(a.prog) - D.dias(b.prog); });

    var actasList = store.byDg('actas').sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    var counts = { todos: all.length, pendientes: all.filter(function (i) { return !i.real; }).length, realizadas: all.filter(function (i) { return !!i.real; }).length };

    return '' +
      '<div class="view-header"><div><div class="view-title">Autoinspecciones</div>' +
        '<div class="view-sub">Cronograma, hallazgos y actas · ' + esc(store.dg().nombre) + '</div></div>' +
        '<div class="header-actions">' +
          '<button class="btn btn-ghost" data-action="fmt-insp">' + icon('settings', 16) + 'Formato propio</button>' +
          '<button class="btn btn-ghost" data-action="cron-insp">' + icon('upload', 16) + 'Importar cronograma</button>' +
          '<button class="btn btn-ghost" data-action="nueva-acta">' + icon('insp', 16) + 'Nueva acta</button>' +
          '<button class="btn btn-primary" data-action="programar-insp">' + icon('plus', 16) + 'Programar</button></div></div>' +
      (actasList.length ? '<div class="section-title">Actas de inspección</div><div class="list">' + actasList.map(actaRow).join('') + '</div>' : '') +
      '<div class="section-title">Sub-programa</div>' +
      '<div class="subprog"><div class="subprog-txt">Llená el acta fuera de la app: descargá el formato de <b>' + esc(store.dg().nombre) +
        '</b>, completalo en el sub-programa y volvé a cargar acá el archivo llenado.</div>' +
        '<button class="btn btn-ghost" data-action="abrir-subprog">' + icon('insp', 16) + 'Abrir</button>' +
        '<button class="btn btn-ghost" data-action="formato-acta">' + icon('download', 16) + 'Formato</button>' +
        '<button class="btn btn-ghost" data-action="cargar-acta">' + icon('upload', 16) + 'Cargar acta llenada</button></div>' +
      '<div class="section-title">Cronograma</div>' +
      filterPills(S.filtInsp, [
        { v: 'todos', l: 'Todas', c: counts.todos }, { v: 'pendientes', l: 'Pendientes', c: counts.pendientes }, { v: 'realizadas', l: 'Realizadas', c: counts.realizadas }
      ], 'data-finsp') +
      (insp.length ? '<div class="list">' + insp.map(inspRow).join('') + '</div>'
        : emptyState('insp', 'Sin autoinspecciones', all.length ? 'Ninguna coincide con el filtro.' : 'Programá tu primera autoinspección.',
          all.length ? '' : '<button class="btn btn-primary" data-action="programar-insp">' + icon('plus', 16) + 'Programar</button>' +
            '<button class="btn btn-ghost" data-action="cron-insp">' + icon('upload', 16) + 'Importar cronograma</button>'));
  }

  function inspRow(i) {
    var r = !!i.real, f = D.fDias(D.dias(i.prog));
    var right = r ? tag('realizada') : '<span class="days ' + f.cls + '">' + f.txt + '</span>';
    var foot = r ? '<div class="row-foot"><span class="row-plain" style="flex:1;min-width:0">' + esc(i.result || 'Realizada') + '</span>' +
      (i.hall > 0 ? '<span class="tag vencido"><i></i>' + i.hall + ' hallazgo' + (i.hall > 1 ? 's' : '') + '</span>' : '<span class="tag vigente"><i></i>Sin hallazgos</span>') + '</div>' : '';
    return '<div class="row" data-insp="' + i.id + '"><div class="row-top"><div class="chan insp"></div><div class="row-main">' +
      '<div class="row-name">' + esc(i.area) + '</div>' +
      '<div class="row-meta"><span><b>Programada</b>' + esc(D.fLocal(i.prog)) + '</span>' + (r ? '<span><b>Realizada</b>' + esc(D.fLocal(i.real)) + '</span>' : '') + '</div></div>' + right + '</div>' + foot + '</div>';
  }

  function actaRow(a) {
    var checklist = a.checklist || D.checklistOficial();
    var total = checklist.reduce(function (n, s) { return n + s.items.length; }, 0);
    var done = Object.keys(a.respuestas || {}).length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var label = a.completada ? 'Completada' : 'En progreso (' + pct + '%)';
    var cls = a.completada ? 'realizada' : (pct > 0 ? 'por_vencer' : 'vencido');
    var hallTxt = a.hall > 0 ? ' · ' + a.hall + ' hallazgo' + (a.hall > 1 ? 's' : '') : '';
    var pasoTxt = (!a.completada && a.paso > 0 && a.paso <= checklist.length) ? ' · quedó en sección ' + a.paso + ' de ' + checklist.length : '';
    return '<div class="row" data-acta="' + a.id + '"><div class="row-top"><div class="chan insp"></div><div class="row-main">' +
      '<div class="row-name">Acta N.° ' + esc(a.numActa || '—') + ' · Inspección al almacén</div>' +
      '<div class="row-meta"><span>' + esc(D.fLocal(a.fecha)) + (a.auditor ? ' · ' + esc(a.auditor) : '') + esc(hallTxt) + esc(pasoTxt) + '</span></div></div>' + tag(cls, label) + '</div></div>';
  }

  function inspForm(existing) {
    var i = existing || { area: 'Almacén general', prog: D.isoDesdeHoy(30) };
    var m = UI.dialog({
      title: existing ? 'Editar autoinspección' : 'Programar autoinspección',
      body:
        '<div class="field"><label>Área a inspeccionar</label><input class="inp" id="i_area" value="' + esc(i.area) + '"></div>' +
        '<div class="field"><label>Fecha programada</label><input class="inp" id="i_prog" type="date" value="' + esc(i.prog) + '"></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="i_save">Guardar</button>',
      onMount: function (root) {
        root.querySelector('#i_save').onclick = function () {
          var obj = Object.assign({}, existing || {}, {
            id: existing ? existing.id : D.nextId(), e: store.dg().id,
            area: root.querySelector('#i_area').value.trim() || 'Almacén general',
            prog: root.querySelector('#i_prog').value || D.isoHoy(),
            real: existing ? existing.real : null, result: existing ? existing.result : '', hall: existing ? existing.hall : 0
          });
          store.save('inspecciones', obj).then(function () { m.close(); UI.note(existing ? 'Autoinspección actualizada' : 'Autoinspección programada'); });
        };
      }
    });
  }

  function inspPanel(i) {
    var r = !!i.real;
    UI.panel({
      title: 'Autoinspección',
      body:
        '<div class="panel-lead-title" style="margin-bottom:12px">' + esc(i.area) + '</div>' +
        detailRow('Programada', D.fLocal(i.prog)) +
        (r ? detailRow('Realizada', D.fLocal(i.real)) + detailRow('Hallazgos abiertos', String(i.hall || 0)) : '') +
        (r && i.result ? '<div class="section-title">Resultado</div><p class="panel-text">' + esc(i.result) + '</p>' : ''),
      footer:
        (r ? '' : '<button class="btn btn-primary" data-close-ins>' + icon('check', 16) + 'Registrar resultado</button>') +
        '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
        '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>',
      onMount: function (root) {
        var ce = root.querySelector('[data-close-ins]'); if (ce) ce.onclick = function () { root.querySelector('[data-close]').click(); inspCloseForm(i); };
        root.querySelector('[data-edit]').onclick = function () { root.querySelector('[data-close]').click(); inspForm(i); };
        root.querySelector('[data-del]').onclick = function () { root.querySelector('[data-close]').click(); store.removeWithUndo('inspecciones', i, 'Autoinspección eliminada'); };
      }
    });
  }

  function inspCloseForm(i) {
    var m = UI.dialog({
      title: 'Registrar resultado',
      body:
        '<div class="field"><label>Fecha de realización</label><input class="inp" id="r_fecha" type="date" value="' + D.isoHoy() + '"></div>' +
        '<div class="field"><label>Hallazgos abiertos</label><input class="inp mono" id="r_hall" type="number" min="0" value="0"></div>' +
        '<div class="field"><label>Resultado / observaciones</label><textarea class="inp" id="r_res" placeholder="Resumen de la inspección…"></textarea></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="r_save">Registrar</button>',
      onMount: function (root) {
        root.querySelector('#r_save').onclick = function () {
          var obj = Object.assign({}, i, {
            real: root.querySelector('#r_fecha').value || D.isoHoy(),
            hall: +root.querySelector('#r_hall').value || 0,
            result: root.querySelector('#r_res').value.trim()
          });
          store.save('inspecciones', obj).then(function () { m.close(); UI.note('Resultado registrado'); });
        };
      }
    });
  }

  /* ----- Sub-programa `autoinspecciones/`: sale el formato, vuelve el acta llenada -----
     El sub-programa no ve esta base de datos; el archivo es todo el puente. */
  function formatoActaDescarga() {
    var dg = store.dg();
    UI.download('formato-acta-' + (dg.ruc || dg.init || 'drogueria') + '.json', D.formatoActa(dg, null));
    UI.note('Formato descargado — abrilo en el sub-programa');
  }

  function cargarActaLlenada() {
    UI.pickJSON(function (data) {
      var pack;
      try { pack = D.leerActa(data); } catch (err) { UI.note(err.message || 'Archivo inválido'); return; }
      var dg = store.dg();
      var otra = pack.drogueria.id && pack.drogueria.id !== dg.id;
      var previa = pack.acta.numActa
        ? store.byDg('actas').filter(function (x) { return x.numActa === pack.acta.numActa; })[0] : null;
      var h = D.hallazgos(pack.acta);
      UI.confirm({
        title: previa ? 'Reemplazar acta N.° ' + pack.acta.numActa : 'Cargar acta llenada',
        message: (otra ? 'Ojo: el archivo se llenó para «' + (pack.drogueria.nombre || '—') + '» y lo vas a cargar en «' + dg.nombre + '». ' : '') +
          h.evaluados + ' de ' + h.total + ' ítems evaluados, ' + h.abiertos + ' hallazgo(s) abierto(s). ' +
          (previa ? 'Ya hay un acta con ese número: se reemplaza por la del archivo.' : 'Se agrega a ' + dg.nombre + '.'),
        okLabel: previa ? 'Reemplazar' : 'Cargar', danger: otra || !!previa
      }).then(function (ok) {
        if (!ok) return;
        var obj = Object.assign({}, previa || {}, pack.acta, { id: previa ? previa.id : pack.acta.id, e: dg.id });
        store.save('actas', obj).then(function () { UI.note('Acta cargada'); });
      });
    });
  }

  /* ----- Editor de acta oficial de inspección al almacén (REGISTRO_004) ----- */
  function actaForm(existing) {
    var dg = store.dg();
    var isNew = !existing;
    var a = existing || D.actaNueva(dg);
    a.checklist = a.checklist || D.checklistOficial();
    a.respuestas = a.respuestas || {};
    if (typeof a.paso !== 'number') a.paso = 0;
    var total = a.checklist.reduce(function (n, s) { return n + s.items.length; }, 0);
    // Pasos: 0 = datos generales, 1..N = una sección de checklist cada uno, N+1 = resumen y cierre
    var STEP_HEADER = 0, STEP_SUMMARY = a.checklist.length + 1;

    function secDoneCount(sec) { return sec.items.filter(function (it, idx) { return a.respuestas[sec.seccion + '::' + idx]; }).length; }
    function totalDone() { return Object.keys(a.respuestas).length; }

    function persist() {
      return store.save('actas', a);
    }

    function computeHallazgos() { D.aplicarHallazgos(a); }

    /* ---- barra de progreso general (secciones completas / total) ---- */
    function wizardProgressHtml() {
      var secsDone = a.checklist.filter(function (s) { return secDoneCount(s) === s.items.length; }).length;
      var pct = a.checklist.length ? Math.round(secsDone / a.checklist.length * 100) : 0;
      return '<div class="wizard-progress"><div class="progress-top"><span>Secciones completas</span><strong>' + secsDone + ' / ' + a.checklist.length + '</strong></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="wizard-dots">' + a.checklist.map(function (s, i) {
          var d = secDoneCount(s), t = s.items.length, cls = d === 0 ? '' : d === t ? 'done' : 'partial';
          return '<button type="button" class="wizard-dot ' + cls + ' ' + (a.paso === i + 1 ? 'current' : '') + '" data-goto-step="' + (i + 1) + '" title="' + esc(s.seccion) + ' (' + d + '/' + t + ')"></button>';
        }).join('') + '</div></div>';
    }

    /* ---- paso 0: datos generales ---- */
    function headerStepHtml() {
      return '<div class="field"><label>Acta N.°</label><input class="inp mono" id="a_num" value="' + esc(a.numActa) + '" placeholder="001-2026"></div>' +
        '<div class="grid-2"><div class="field"><label>Fecha</label><input class="inp" id="a_fecha" type="date" value="' + esc(a.fecha) + '"></div>' +
        '<div class="field"><label>Auditor</label><input class="inp" id="a_aud" value="' + esc(a.auditor) + '"></div></div>' +
        '<div class="field"><label>Almacén inspeccionado</label><input class="inp" id="a_almacen" value="' + esc(a.almacen) + '"></div>' +
        '<details class="acta-extra" open><summary>Datos generales del acta</summary>' +
          '<div class="grid-2"><div class="field"><label>R.U.C.</label><input class="inp mono" id="a_ruc" value="' + esc(a.ruc) + '" maxlength="11"></div>' +
          '<div class="field"><label>R.D. autorización sanitaria</label><input class="inp" id="a_rd" value="' + esc(a.rdAutorizacion) + '"></div></div>' +
          '<div class="field"><label>Planos de distribución de las áreas del almacén</label><input class="inp" id="a_planos" value="' + esc(a.planos) + '"></div>' +
          '<div class="field"><label>Relación de clientes y proveedores</label><input class="inp" id="a_cliprov" value="' + esc(a.clientesProveedores) + '"></div>' +
          '<div class="field"><label>Relación de productos que comercializa</label><input class="inp" id="a_prod" value="' + esc(a.productos) + '"></div>' +
          '<div class="field"><label>Lista de procedimientos operativos estándar verificados</label><input class="inp" id="a_poe" value="' + esc(a.poeVerificados) + '"></div>' +
          '<div class="field"><label>Resultados de inspecciones anteriores</label><textarea class="inp" id="a_prev" placeholder="Plan de acciones realizadas y su eficacia…">' + esc(a.resultadosPrevios || '') + '</textarea></div>' +
        '</details>' +
        '<p class="dialog-note" style="margin-top:14px">Después de esto vas a completar el checklist de a una sección por vez — 15 en total, ' + total + ' ítems. Podés cerrar en cualquier momento: queda guardado tal cual lo dejaste.</p>';
    }
    function collectHeader(root) {
      a.numActa = root.querySelector('#a_num').value.trim();
      a.fecha = root.querySelector('#a_fecha').value || D.isoHoy();
      a.auditor = root.querySelector('#a_aud').value.trim();
      a.almacen = root.querySelector('#a_almacen').value.trim() || dg.nombre;
      a.ruc = root.querySelector('#a_ruc').value.trim();
      a.rdAutorizacion = root.querySelector('#a_rd').value.trim();
      a.planos = root.querySelector('#a_planos').value.trim();
      a.clientesProveedores = root.querySelector('#a_cliprov').value.trim();
      a.productos = root.querySelector('#a_prod').value.trim();
      a.poeVerificados = root.querySelector('#a_poe').value.trim();
      a.resultadosPrevios = root.querySelector('#a_prev').value.trim();
    }

    /* ---- pasos 1..N: una sección del checklist ---- */
    function sectionStepHtml(secIdx) {
      var sec = a.checklist[secIdx];
      var d = secDoneCount(sec);
      return '<div class="section-step-head"><div class="section-step-title">' + esc(sec.seccion) + '</div>' +
        '<span class="section-step-count">' + d + ' / ' + sec.items.length + '</span></div>' +
        actas.itemsHtml(sec, a.respuestas);
    }

    /* ---- paso final: resumen ---- */
    function summaryStepHtml() {
      computeHallazgos();
      var pct = total ? Math.round(totalDone() / total * 100) : 0;
      var incompletas = a.checklist.filter(function (s) { return secDoneCount(s) < s.items.length; });
      return '<div class="progress" style="margin-bottom:16px"><div class="progress-top"><span>Ítems evaluados</span><strong>' + totalDone() + ' / ' + total + ' (' + pct + '%)</strong></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>' +
        '<table style="width:100%;margin-bottom:16px"><tbody>' +
          '<tr><th style="text-align:left">Hallazgos críticos</th><td>' + (a.hallCritico || 0) + '</td></tr>' +
          '<tr><th style="text-align:left">Hallazgos mayores</th><td>' + (a.hallMayor || 0) + '</td></tr>' +
          '<tr><th style="text-align:left">Hallazgos menores</th><td>' + (a.hallMenor || 0) + '</td></tr>' +
        '</tbody></table>' +
        (incompletas.length ? '<p class="dialog-note">Secciones sin terminar: ' + incompletas.map(function (s) { return esc(s.seccion); }).join(', ') + '.</p>' : '<p class="dialog-note">Todas las secciones están completas.</p>') +
        '<div class="field"><label>Observaciones adicionales</label><textarea class="inp" id="a_obsad">' + esc(a.observAdicionales || '') + '</textarea></div>' +
        '<div class="field"><label>Evaluación y conclusiones</label><textarea class="inp" id="a_conc">' + esc(a.conclusiones || '') + '</textarea></div>' +
        '<div class="field"><label>Propuestas de medidas correctivas</label><textarea class="inp" id="a_med">' + esc(a.medidas || '') + '</textarea></div>';
    }
    function collectSummary(root) {
      a.observAdicionales = root.querySelector('#a_obsad').value.trim();
      a.conclusiones = root.querySelector('#a_conc').value.trim();
      a.medidas = root.querySelector('#a_med').value.trim();
    }

    /* ---- render del paso actual dentro del diálogo ya abierto ---- */
    var dialogApi = null, mountRoot = null;
    function cardEl() { return (dialogApi && dialogApi.el) || (mountRoot && mountRoot.querySelector('.dialog-card')); }
    function stepTitle() {
      if (a.paso === STEP_HEADER) return existing ? 'Acta de inspección · Datos generales' : 'Nueva acta · Datos generales';
      if (a.paso === STEP_SUMMARY) return 'Acta de inspección · Resumen';
      return 'Sección ' + a.paso + ' de ' + a.checklist.length;
    }
    function bodyForStep() {
      if (a.paso === STEP_HEADER) return headerStepHtml();
      if (a.paso === STEP_SUMMARY) return wizardProgressHtml() + summaryStepHtml();
      return wizardProgressHtml() + '<div id="a_section">' + sectionStepHtml(a.paso - 1) + '</div>';
    }
    function footerForStep() {
      var back = a.paso > STEP_HEADER ? '<button class="btn btn-ghost" id="a_back">Atrás</button>' : '<button class="btn btn-ghost" data-close>Cerrar (queda guardado)</button>';
      var next = a.paso < STEP_SUMMARY
        ? '<button class="btn btn-primary" id="a_next">' + (a.paso === STEP_HEADER ? 'Comenzar checklist' : 'Siguiente sección') + '</button>'
        : '<button class="btn btn-ghost" id="a_print">' + icon('print', 16) + 'Imprimir</button><button class="btn btn-primary" id="a_finish">Guardar y cerrar</button>';
      return back + '<span style="flex:1"></span>' + next;
    }

    function renderStep() {
      dialogApi.el.querySelector('.dialog-title').textContent = stepTitle();
      dialogApi.el.querySelector('.dialog-body').innerHTML = bodyForStep();
      dialogApi.el.querySelector('.dialog-foot').innerHTML = footerForStep();
      wireStep();
      dialogApi.el.querySelector('.dialog-body').scrollTop = 0;
    }

    function goToStep(n, root) {
      // recolecta lo que se ve en pantalla antes de cambiar de paso, para no perder nada
      if (a.paso === STEP_HEADER) collectHeader(root);
      else if (a.paso === STEP_SUMMARY) collectSummary(root);
      a.paso = Math.max(STEP_HEADER, Math.min(STEP_SUMMARY, n));
      computeHallazgos();
      persist().then(renderStep);
    }

    function wireStep() {
      var root = cardEl();
      var backBtn = root.querySelector('#a_back'); if (backBtn) backBtn.onclick = function () { goToStep(a.paso - 1, root); };
      var nextBtn = root.querySelector('#a_next'); if (nextBtn) nextBtn.onclick = function () { goToStep(a.paso + 1, root); };
      var finishBtn = root.querySelector('#a_finish');
      if (finishBtn) finishBtn.onclick = function () { collectSummary(root); computeHallazgos(); persist().then(function () { dialogApi.close(); UI.note('Acta guardada'); }); };
      var printBtn = root.querySelector('#a_print');
      if (printBtn) printBtn.onclick = function () { collectSummary(root); computeHallazgos(); persist().then(function () { actas.actaInspeccion(store.dg(), a); }); };

      function wireDots() {
        root.querySelectorAll('[data-goto-step]').forEach(function (btn) {
          btn.onclick = function () { goToStep(+btn.dataset.gotoStep, root); };
        });
      }

      var section = root.querySelector('#a_section');
      if (section) {
        section.addEventListener('click', function (e) {
          var b = e.target.closest('.chk-opt'); if (!b) return;
          var key = b.closest('[data-key]').dataset.key, v = b.dataset.v;
          var cur = (a.respuestas[key] || {}).v;
          if (cur === v) { delete a.respuestas[key]; } else { a.respuestas[key] = Object.assign(a.respuestas[key] || {}, { v: v }); }
          persist();
          section.innerHTML = sectionStepHtml(a.paso - 1);
          var dots = root.querySelector('.wizard-progress');
          if (dots) { dots.outerHTML = wizardProgressHtml(); wireDots(); }
        });
        section.addEventListener('input', function (e) {
          var t = e.target; if (!t.classList.contains('chk-obs')) return;
          var key = t.dataset.obskey;
          if (a.respuestas[key]) { a.respuestas[key].obs = t.value; persist(); }
        });
      }
      wireDots();
    }

    dialogApi = UI.dialog({
      title: stepTitle(), wide: true,
      body: bodyForStep(),
      footer: footerForStep(),
      onMount: function (root) { mountRoot = root; wireStep(); },
      onClose: function () { if (isNew && totalDone() === 0 && a.paso === STEP_HEADER) store.remove('actas', a.id).catch(function () {}); }
    });
    // guarda el acta apenas se crea (paso 0), así "cerrar y volver después" ya tiene algo para retomar
    if (isNew) persist();
  }

  /* ===================================================================== *
   *  DROGUERÍAS + criterios
   * ===================================================================== */
  function dgForm(existing) {
    var e = existing || { nombre: '', ruc: '', direccion: '', dt: '', criterios: D.CRITERIOS_DEFAULT.slice() };
    var m = UI.dialog({
      title: existing ? 'Editar droguería' : 'Nueva droguería',
      body:
        '<div class="field" id="wrap_en"><label>Razón social</label><input class="inp" id="e_nom" value="' + esc(e.nombre) + '"><div class="err">Ingresá la razón social.</div></div>' +
        '<div class="grid-2"><div class="field"><label>RUC</label><input class="inp mono" id="e_ruc" value="' + esc(e.ruc) + '" maxlength="11"></div>' +
        '<div class="field"><label>Director técnico</label><input class="inp" id="e_dt" value="' + esc(e.dt || '') + '"></div></div>' +
        '<div class="field"><label>Dirección</label><input class="inp" id="e_dir" value="' + esc(e.direccion || '') + '"></div>',
      footer: (existing ? '<button class="btn btn-danger" id="e_del" style="margin-right:auto">Eliminar</button>' : '') +
        '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="e_save">Guardar</button>',
      onMount: function (root) {
        root.querySelector('#e_save').onclick = function () {
          var nom = root.querySelector('#e_nom').value.trim();
          if (!nom) { root.querySelector('#wrap_en').classList.add('invalid'); return; }
          var init = nom.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
          var obj = Object.assign({}, existing || { criterios: D.CRITERIOS_DEFAULT.slice() }, {
            id: existing ? existing.id : D.nextId(), nombre: nom,
            ruc: root.querySelector('#e_ruc').value.trim(), dt: root.querySelector('#e_dt').value.trim(),
            direccion: root.querySelector('#e_dir').value.trim(), init: init
          });
          store.save('droguerias', obj).then(function () {
            if (!existing) store.setDg(obj.id);
            m.close(); UI.note(existing ? 'Droguería actualizada' : 'Droguería creada'); store.renderChrome();
          });
        };
        var del = root.querySelector('#e_del');
        if (del) del.onclick = function () {
          m.close();
          UI.confirm({ title: 'Eliminar droguería', message: 'Se eliminará la droguería y todos sus documentos, capacitaciones e inspecciones. Esta acción no se puede deshacer.', okLabel: 'Eliminar', danger: true })
            .then(function (ok) { if (ok) store.deleteDg(existing.id); });
        };
      }
    });
  }

  function dgSwitcher() {
    var list = store.data.droguerias;
    UI.actionsheet(list.map(function (e) {
      return { label: e.nombre + (e.id === store.dg().id ? '  ✓' : ''), icon: 'building', onClick: function () { store.setDg(e.id); } };
    }).concat([
      { label: 'Nueva droguería…', icon: 'plus', onClick: function () { dgForm(null); } },
      { label: 'Editar droguería actual…', icon: 'edit', onClick: function () { dgForm(store.dg()); } },
      { label: 'Editar criterios de clasificación…', icon: 'settings', onClick: function () { criteriosForm(); } },
      { label: 'Cambiar PIN…', icon: 'settings', onClick: function () { global.BPAPLUS.lock.openSettings(); } }
    ]));
  }

  function criteriosForm() {
    var e = store.dg();
    var crit = (e.criterios || D.CRITERIOS_DEFAULT).slice();
    function rowsHtml() {
      return crit.map(function (c) { return '<div class="mini-row"><input class="inp crit-inp" value="' + esc(c) + '"><button class="icon-btn" type="button" data-delc aria-label="Quitar">' + icon('x', 16) + '</button></div>'; }).join('');
    }
    var m = UI.dialog({
      title: 'Criterios de clasificación',
      body: '<p class="dialog-note">Los documentos se agrupan automáticamente en estas categorías según su código o nombre.</p>' +
        '<div id="critList">' + rowsHtml() + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="critAdd" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar criterio</button>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="critSave">Guardar</button>',
      onMount: function (root) {
        var list = root.querySelector('#critList');
        root.querySelector('#critAdd').onclick = function () { var d = document.createElement('div'); d.innerHTML = '<div class="mini-row"><input class="inp crit-inp" value=""><button class="icon-btn" type="button" data-delc aria-label="Quitar">' + icon('x', 16) + '</button></div>'; list.appendChild(d.firstChild); };
        list.addEventListener('click', function (ev) { var b = ev.target.closest('[data-delc]'); if (b) b.closest('.mini-row').remove(); });
        root.querySelector('#critSave').onclick = function () {
          var vals = Array.prototype.map.call(list.querySelectorAll('.crit-inp'), function (x) { return x.value.trim(); }).filter(Boolean);
          store.save('droguerias', Object.assign({}, e, { criterios: vals.length ? vals : D.CRITERIOS_DEFAULT.slice() })).then(function () { m.close(); UI.note('Criterios actualizados'); });
        };
      }
    });
  }

  /* ===================================================================== *
   *  Registro + despacho de vistas
   * ===================================================================== */
  var RENDERERS = {
    dashboard: vDashboard, documentos: vDocumentos, capacitaciones: vCapacitaciones,
    autoinspecciones: vAutoinspecciones, retiros: function () { return global.BPAPLUS.retiro.view(); }
  };
  function render(view) { return (RENDERERS[view] || vDashboard)(); }

  /* Formatos propios de la droguería: viven en la droguería, así que guardarlos
     es guardar la droguería. Mismo panel desde Capacitaciones y Autoinspecciones. */
  function formatosPanel(modulo) {
    global.BPAPLUS.formatos.manage(store.dg(), modulo, function (dgNext) {
      return store.save('droguerias', dgNext);
    });
  }

  function bind(container) {
    container.addEventListener('click', function (e) {
      var t = e.target;
      var goto = t.closest('[data-goto]'); if (goto) return store.go(goto.dataset.goto);
      var act = t.closest('[data-action]');
      if (act) {
        var a = act.dataset.action;
        if (a === 'nuevo-doc') return docForm(null);
        if (a === 'nueva-cap') return capForm(null);
        if (a === 'programar-insp') return inspForm(null);
        if (a === 'nueva-acta') return actaForm(null);
        if (a === 'nuevo-retiro') return global.BPAPLUS.retiro.form(null);
        if (a === 'cron-cap') return store.importCronograma('capacitaciones');
        if (a === 'cron-insp') return store.importCronograma('inspecciones');
        if (a === 'fmt-cap') return formatosPanel('capacitaciones');
        if (a === 'fmt-insp') return formatosPanel('inspecciones');
        if (a === 'abrir-subprog') return global.open('autoinspecciones/index.html', '_blank');
        if (a === 'formato-acta') return formatoActaDescarga();
        if (a === 'cargar-acta') return cargarActaLlenada();
        if (a === 'export') return store.exportData();
        return;
      }
      var fd = t.closest('[data-fdoc]'); if (fd) { store.state.filtDoc = fd.dataset.fdoc; return store.render(); }
      var fc = t.closest('[data-fcap]'); if (fc) { store.state.filtCap = fc.dataset.fcap; return store.render(); }
      var fi = t.closest('[data-finsp]'); if (fi) { store.state.filtInsp = fi.dataset.finsp; return store.render(); }
      var done = t.closest('[data-capdone]');
      if (done) { e.stopPropagation();
        var c = store.find('capacitaciones', done.dataset.capdone);
        var to = done.dataset.to;
        store.save('capacitaciones', Object.assign({}, c, { est: to })).then(function () { UI.note(to === 'realizada' ? 'Marcada como realizada' : 'Marcada como pendiente'); UI.haptic(); });
        return;
      }
      var ca = t.closest('[data-capacta]');
      if (ca) { e.stopPropagation(); actas.actaAsistencia(store.dg(), store.find('capacitaciones', ca.dataset.capacta)); return; }
      var rp = t.closest('[data-retiro-print]');
      if (rp) { e.stopPropagation(); return global.BPAPLUS.retiro.imprimirTodo(store.dg(), store.find('retiros', rp.dataset.retiroPrint)); }
      var rr = t.closest('[data-retiro]'); if (rr) return global.BPAPLUS.retiro.panel(store.find('retiros', rr.dataset.retiro));
      var dr = t.closest('[data-doc]'); if (dr) return docPanel(store.find('documentos', dr.dataset.doc));
      var cr = t.closest('[data-cap]'); if (cr) return capPanel(store.find('capacitaciones', cr.dataset.cap));
      var ir = t.closest('[data-insp]'); if (ir) return inspPanel(store.find('inspecciones', ir.dataset.insp));
      var ar = t.closest('[data-acta]'); if (ar) return actaForm(store.find('actas', ar.dataset.acta));
    });
    container.addEventListener('input', function (e) {
      if (e.target.id === 'qDoc') { store.state.qDoc = e.target.value; store.renderInto(); }
    });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.views = {
    setStore: function (s) { store = s; }, render: render, bind: bind,
    open: { docForm: docForm, capForm: capForm, inspForm: inspForm, actaForm: actaForm, dgSwitcher: dgSwitcher, dgForm: dgForm, criteriosForm: criteriosForm,
      formatoActa: formatoActaDescarga, cargarActa: cargarActaLlenada },
    panels: { docPanel: docPanel, capPanel: capPanel, inspPanel: inspPanel }
  };
})(window);
