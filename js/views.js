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
  var SECCIONES_INSPECCION = [
    { id: 'listados', titulo: 'Listados', docs: [
      ['listado-clientes', 'Lista de clientes'], ['listado-proveedores', 'Lista de proveedores'], ['listado-registros', 'Listado de registros']
    ] },
    { id: 'resoluciones', titulo: 'Resoluciones BPA', docs: [
      ['autorizacion-sanitaria', 'Autorización Sanitaria'], ['certificado-bpa', 'Certificado BPA']
    ] },
    { id: 'almacen', titulo: 'Documentos del almacén', docs: [
      ['planos-almacen', 'Planos e información del almacén', ['planos-drogueria']]
    ] }
  ];

  function opts(list, sel) { return list.map(function (o) { return '<option ' + (o === sel ? 'selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }

  /* ===================================================================== *
   *  PANORAMA (dashboard)
   * ===================================================================== */
  var MES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  /* Inicio: primero lo que hay que hacer, cada cosa con el botón que la resuelve. El panorama
     anterior mostraba las mismas cifras dos veces (faro y tarjetas) sin decir qué hacer. */
  function vDashboard() {
    var docs = store.byDg('documentos'), caps = store.byDg('capacitaciones'), insp = store.byDg('inspecciones');
    var sc = D.scoreCumplimiento(docs, caps, insp);
    var dVenc = docs.filter(function (d) { return D.edoc(d) === 'vencido'; });
    var dPV = docs.filter(function (d) { return D.edoc(d) === 'por_vencer'; }).length;
    var cVenc = caps.filter(function (c) { return D.ecap(c) === 'vencida'; });
    var cPend = caps.filter(function (c) { return D.ecap(c) === 'pendiente'; }).length;
    var iAtras = insp.filter(function (i) { return !i.real && D.dias(i.prog) < 0; });
    var iHall = insp.filter(function (i) { return i.real && (i.hall || 0) > 0; });
    var hall = iHall.reduce(function (a, i) { return a + i.hall; }, 0);

    var todo = []
      .concat(dVenc.map(function (d) {
        return { dias: D.dias(d.rev), ico: 'doc', tone: 'doc', attr: 'data-doc="' + d.id + '"', nombre: d.nombre,
          tipo: 'Documento · <span class="mono">' + esc(d.codigo) + '</span>', btn: '<button class="btn btn-ghost btn-sm" type="button">Revisar</button>' };
      }))
      .concat(cVenc.map(function (c) {
        return { dias: D.dias(c.fecha), ico: 'cap', tone: 'cap', attr: 'data-cap="' + c.id + '"', nombre: c.tema,
          tipo: 'Capacitación' + (c.area ? ' · ' + esc(c.area) : ''), btn: '<button class="btn btn-ghost btn-sm" type="button">Registrar</button>' };
      }))
      .concat(iAtras.map(function (i) {
        return { dias: D.dias(i.prog), ico: 'clipboard', tone: 'insp', attr: 'data-insp="' + i.id + '"', nombre: i.area,
          tipo: 'Autoinspección · programada ' + esc(D.fLocal(i.prog)), btn: '<button class="btn btn-primary btn-sm" type="button" data-action="nueva-acta">Iniciar acta</button>' };
      }))
      .sort(function (a, b) { return a.dias - b.dias; })
      .concat(iHall.map(function (i) {
        return { ico: 'alert', tone: 'bad', attr: 'data-insp="' + i.id + '"', nombre: i.hall + ' hallazgo(s) abierto(s) en ' + i.area,
          tipo: 'Hallazgos · inspección del ' + esc(D.fLocal(i.real)), due: '<span class="days soon">Sin cerrar</span>',
          btn: '<button class="btn btn-ghost btn-sm" type="button">Ver</button>' };
      }));

    var proximos = []
      .concat(docs.map(function (d) { return { tipo: d.tipo || 'Documento', codigo: d.codigo, nombre: d.nombre, fecha: d.rev }; }))
      .concat(caps.filter(function (c) { return D.ecap(c) === 'pendiente'; }).map(function (c) { return { tipo: 'Capacitación', nombre: c.tema, fecha: c.fecha }; }))
      .concat(insp.filter(function (i) { return !i.real; }).map(function (i) { return { tipo: 'Autoinspección', nombre: i.area, fecha: i.prog }; }))
      .filter(function (e) { return D.dias(e.fecha) >= 0 && isFinite(D.dias(e.fecha)); })
      .sort(function (a, b) { return D.dias(a.fecha) - D.dias(b.fecha); })
      .slice(0, 6);

    var C = 2 * Math.PI * 46, off = C * (1 - sc.score / 100);

    return '' +
      '<div class="view-header"><div>' +
        '<div class="view-title">Inicio</div>' +
        '<div class="view-sub">' + (todo.length ? todo.length + (todo.length === 1 ? ' asunto requiere' : ' asuntos requieren') + ' tu atención' : 'Todo al día') + ' · ' + esc(store.dg().nombre) + '</div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" data-action="export">' + icon('download', 16) + 'Exportar respaldo</button>' +
      '</div>' +

      '<div class="home">' +
        '<section class="card score-card">' +
          '<div class="card-head"><h2 class="card-title">Cumplimiento BPA</h2><span class="chip ' + sc.cls + '">' + esc(sc.msg) + '</span></div>' +
          '<div class="score-body">' +
            '<div class="ring"><svg viewBox="0 0 112 112" aria-hidden="true"><circle class="ring-bg" cx="56" cy="56" r="46"></circle>' +
              '<circle class="ring-fg ' + sc.cls + '" cx="56" cy="56" r="46" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"></circle></svg>' +
              '<div class="ring-num"><b>' + sc.score + '%</b><span>al día</span></div></div>' +
            '<div class="meters">' +
              meter('Documentos', sc.docsOK, sc.docsTot, dVenc.length + ' vencido(s) · ' + dPV + ' por vencer') +
              meter('Capacitaciones', sc.capsOK, sc.capsTot, cVenc.length + ' vencida(s) · ' + cPend + ' programada(s)') +
              meter('Autoinspecciones', sc.inspOK, sc.inspTot, hall + ' hallazgo(s) abierto(s) · ' + iAtras.length + ' atrasada(s)') +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="card todo-card">' +
          '<div class="card-head"><h2 class="card-title">Requiere atención</h2>' + (todo.length ? '<span class="chip bad">' + todo.length + '</span>' : '') +
            '<span class="grow"></span><button class="link-btn" type="button" data-action="alertas">Ver alertas</button></div>' +
          (todo.length ? todo.slice(0, 6).map(function (t) {
            return '<div class="todo-row" ' + t.attr + '><span class="todo-ico ' + t.tone + '">' + icon(t.ico, 16) + '</span>' +
              '<span class="todo-txt"><span class="todo-tipo">' + t.tipo + '</span><span class="todo-name">' + esc(t.nombre) + '</span></span>' +
              (t.due || '<span class="days late">' + D.fDias(t.dias).txt + '</span>') + t.btn + '</div>';
          }).join('') : '<div class="todo-empty">' + icon('check', 20) + '<span>Nada vencido ni atrasado en esta droguería.</span></div>') +
        '</section>' +

        '<section class="card next-card">' +
          '<div class="card-head"><h2 class="card-title">Próximos vencimientos</h2></div>' +
          (proximos.length ? '<div class="next-grid">' + proximos.map(function (e) {
            var n = D.dias(e.fecha), iso = String(e.fecha);
            return '<div class="next-item"><span class="date-tile"><small>' + MES_CORTO[+iso.slice(5, 7) - 1] + '</small><b>' + iso.slice(8, 10) + '</b></span>' +
              '<span class="todo-txt"><span class="todo-tipo">' + esc(e.tipo) + (e.codigo ? ' · <span class="mono">' + esc(e.codigo) + '</span>' : '') + ' · ' + (n === 0 ? 'hoy' : 'en ' + n + ' día' + (n === 1 ? '' : 's')) + '</span>' +
              '<span class="todo-name">' + esc(e.nombre) + '</span></span></div>';
          }).join('') + '</div>' : emptyState('check', 'Sin vencimientos próximos', 'No hay fechas pendientes para esta droguería.')) +
        '</section>' +
      '</div>';
  }

  function meter(label, ok, tot, sub) {
    var pct = tot ? Math.round(ok / tot * 100) : 100;
    var cls = pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    return '<div class="meter"><div class="meter-top"><span>' + label + '</span><span class="mono">' + (tot ? ok + '/' + tot : '—') + '</span></div>' +
      '<div class="meter-track"><div class="meter-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
      '<div class="meter-sub">' + (tot ? sub : 'Sin registros') + '</div></div>';
  }

  /* Sin botones: el alta ya está en el encabezado (y en «Nuevo» en el celular). */
  function emptyState(ico, title, sub) {
    return '<div class="empty">' + icon(ico, 40, 'es-ico') +
      '<span class="es-title">' + esc(title) + '</span>' +
      '<span class="es-sub">' + esc(sub) + '</span></div>';
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

    /* Vista dividida: el documento seleccionado se abre en una columna al costado y la lista
       sigue a la vista. Sin selección (o en pantalla angosta), la lista ocupa todo el ancho. */
    var sel = vistaDividida() && S.selDoc ? store.byDg('documentos').filter(function (d) { return d.id === S.selDoc; })[0] : null;
    var selId = sel ? sel.id : '';

    var body = cats.map(function (cat) {
      var lista = grupos[cat]; if (!lista || !lista.length) return '';
      return '<div class="section-title" style="margin-top:18px">' + esc(cat) + ' <span class="section-count">· ' + lista.length + '</span></div>' +
        '<div class="list">' + lista.map(function (d) { return docRow(d, selId); }).join('') + '</div>';
    }).join('');

    var lista = listaDocumentos(S, all, docs, counts, body);
    if (!sel) return lista;
    return '<div class="split"><div class="split-main">' + lista + '</div>' +
      '<aside class="doc-detail" data-doc-detail="' + sel.id + '" aria-label="Detalle del documento">' +
        '<div class="panel-head"><div class="dialog-title">Documento</div>' +
          '<button class="icon-btn" data-detail-close aria-label="Cerrar detalle">' + icon('x', 18) + '</button></div>' +
        '<div class="panel-body">' + docDetailHtml(sel) + '</div>' +
        '<div class="panel-foot">' + DOC_FOOTER + '</div>' +
      '</aside></div>';
  }

  function listaDocumentos(S, all, docs, counts, body) {
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
      (docs.length ? body : emptyState('doc', 'Sin documentos', all.length ? 'Ningún documento coincide con el filtro.' : 'Agregá tu primer POE, formato o instructivo.'));
  }

  var criterioDeDoc = D.criterioDeDoc;

  function docRow(d, selId) {
    var e = D.edoc(d), f = D.fDias(D.dias(d.rev)), on = d.id === selId;
    return '<div class="row' + (on ? ' selected' : '') + '" data-doc="' + d.id + '" tabindex="0" role="button"' + (on ? ' aria-current="true"' : '') + '>' +
      '<div class="row-top"><div class="chan doc"></div><div class="row-main">' +
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
        '<div class="grid-2"><div class="field" id="wrap_codigo"><label>Código</label><input class="inp mono" id="f_cod" value="' + esc(d.codigo) + '" placeholder="POE-ALM-001"><div class="err">Siglas y número, como figura en el documento (ej. POE-ALM-001).</div></div>' +
        '<div class="field"><label>Versión</label><input class="inp mono" id="f_ver" type="number" min="1" value="' + esc(d.version) + '"></div></div>' +
        '<div class="field" id="wrap_nombre"><label>Nombre del documento</label><input class="inp" id="f_nom" value="' + esc(d.nombre) + '" placeholder="Recepción de productos"><div class="err">Ingresá un nombre.</div></div>' +
        '<div class="grid-2"><div class="field"><label>Área</label><select class="inp" id="f_area">' + opts(global.BPAPLUS.drive.opciones(AREAS, 'area', d.area), d.area) + '</select></div>' +
        '<div class="field"><label>Tipo</label><select class="inp" id="f_tipo">' + opts(global.BPAPLUS.drive.opciones(TIPOS, 'tipo', d.tipo), d.tipo) + '</select></div></div>' +
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

  /* El detalle de un documento vive en dos contenedores: una columna junto a la lista (vista
     dividida, pantallas anchas) o el panel lateral (pantallas angostas). El HTML y los clics
     son uno solo; cambia solo dónde se monta. */
  var VISTA_DIVIDIDA = '(min-width: 1200px)';
  function vistaDividida() { return !!(global.matchMedia && global.matchMedia(VISTA_DIVIDIDA).matches); }

  function docDetailHtml(d) {
    var e = D.edoc(d), f = D.fDias(D.dias(d.rev));
    var history = d.history || [], records = d.records || [];
    var files = (d.templateMissing ? '<div class="file-warning">Falta cargar la plantilla vacía oficial.</div>' : '') +
      (d.file ? '<button class="file-item" data-file-current>' + icon('doc', 15) + '<span><b>Archivo vigente</b><small>' + esc(d.file.name) + ' · Vista previa</small></span></button>' : '<div class="row-empty">Sin archivo vigente.</div>') +
      (history.length ? '<div class="section-title">Versiones anteriores (' + history.length + ')</div>' + history.map(function (file, i) {
        return '<div class="file-item-row"><button class="file-item" data-file-history="' + i + '">' + icon('doc', 15) + '<span><b>Versión archivada</b><small>' + esc(file.name) + ' · Vista previa</small></span></button>' +
          '<button class="icon-btn del" data-file-history-delete="' + i + '" aria-label="Eliminar versión anterior ' + esc(file.name) + '">' + icon('trash', 16) + '</button></div>';
      }).join('') : '') +
      (records.length ? '<div class="section-title">Formatos llenados (' + records.length + ')</div>' + records.map(function (file, i) {
        return '<button class="file-item" data-file-record="' + i + '">' + icon('doc', 15) + '<span><b>Registro</b><small>' + esc(file.name) + ' · Vista previa</small></span></button>';
      }).join('') : '');
    return '<div class="panel-lead"><div><div class="row-code mono">' + esc(d.codigo) + ' · v' + esc(d.version) + '</div>' +
        '<div class="panel-lead-title">' + esc(d.nombre) + '</div></div>' + tag(e) + '</div>' +
      detailRow('Área', d.area) + detailRow('Tipo', d.tipo) +
      detailRow('Próxima revisión', D.fLocal(d.rev) + ' · ' + f.txt) +
      detailRow('Clasificación', criterioDeDoc(d, store.dg().criterios || D.CRITERIOS_DEFAULT)) +
      (global.BPAPLUS.drive.significado(d.codigo) ? detailRow('Siglas', global.BPAPLUS.drive.significado(d.codigo)) : '') +
      '<div class="section-title">Biblioteca documental</div><div class="file-list">' + files + '</div>' +
      '<button class="btn btn-primary btn-sm" data-file-upload style="margin-top:12px">' + icon('upload', 14) + (d.file ? 'Reemplazar / archivar registro' : 'Cargar archivo') + '</button>' +
      (d.driveUrl
        ? '<div class="drive-linked"><span>' + icon('doc', 15) + 'Vinculado a Google Drive</span><a href="' + d.driveUrl + '" target="_blank" rel="noopener" class="link-btn">Abrir original</a></div>'
        : '<button class="btn btn-ghost btn-sm" data-drivelink style="margin-top:12px">' + icon('upload', 14) + 'Vincular a Google Drive</button>');
  }
  var DOC_FOOTER = '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
    '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>';

  /* `close` cierra el contenedor. En la vista dividida (`split`) el detalle se queda abierto al
     editar o cargar un archivo: el render que sigue al guardado ya lo muestra actualizado. */
  function docDetailClick(e, d, close, split) {
    var t = e.target, b;
    function leave() { if (!split) close(); }
    function preview(file) { global.BPAPLUS.drive.previewStored(file).catch(function (error) { UI.note(error.message || error); }); }
    if (!d) return;
    if (t.closest('[data-detail-close]')) return close();
    if (t.closest('[data-edit]')) { leave(); return docForm(d); }
    if (t.closest('[data-del]')) { close(); return store.removeWithUndo('documentos', d, 'Documento eliminado'); }
    if (t.closest('[data-drivelink]')) return global.BPAPLUS.drive.linkPanel(d, function (link) { store.save('documentos', Object.assign({}, d, link)); });
    if (t.closest('[data-file-current]')) return preview(d.file);
    if ((b = t.closest('[data-file-history-delete]'))) {
      var history = d.history || [], index = +b.dataset.fileHistoryDelete, file = history[index], button = b;
      return UI.confirm({ title: 'Eliminar versión anterior', message: 'Se eliminará “' + file.name + '” de Google Drive. Esta acción no se puede deshacer.', okLabel: 'Eliminar', danger: true })
        .then(function (ok) {
          if (!ok) return;
          button.disabled = true;
          return global.BPAPLUS.drive.deleteStored(file)
            .then(function () { return store.save('documentos', Object.assign({}, d, { history: history.filter(function (_, i) { return i !== index; }) })); })
            .then(function () { leave(); UI.note('Versión anterior eliminada'); })
            .catch(function (error) { button.disabled = false; UI.note(error.message || error); });
        });
    }
    if ((b = t.closest('[data-file-history]'))) return preview(d.history[+b.dataset.fileHistory]);
    if ((b = t.closest('[data-file-record]'))) return preview(d.records[+b.dataset.fileRecord]);
    if (t.closest('[data-file-upload]')) { leave(); return global.BPAPLUS.drive.filePanel(d, store.dg().id, function (saved) { return store.save('documentos', saved); }); }
  }

  function docPanel(d) {
    var p = UI.panel({
      title: 'Documento', body: docDetailHtml(d), footer: DOC_FOOTER,
      onMount: function (root) { root.addEventListener('click', function (e) { docDetailClick(e, d, function () { p.close(); }, false); }); }
    });
  }

  /* Abrir un documento desde cualquier lado (lista, Inicio, alertas, buscador): en pantalla
     ancha va a Documentos con ese documento seleccionado; si no, al panel lateral. */
  function abrirDoc(d) {
    if (!d) return;
    if (!vistaDividida()) return docPanel(d);
    store.state.selDoc = d.id;
    if (store.state.view === 'documentos') store.render(); else store.go('documentos');
  }
  function cerrarDetalle() { store.state.selDoc = ''; store.render(); }

  function detailRow(k, v) {
    return '<div class="detail-row"><span class="detail-k">' + esc(k) + '</span><span class="detail-v">' + esc(v) + '</span></div>';
  }

  /* ===================================================================== *
   *  DOCUMENTOS DE INSPECCIÓN
   * ===================================================================== */
  function definicionInspeccion(tipo) {
    for (var i = 0; i < SECCIONES_INSPECCION.length; i++) {
      for (var j = 0; j < SECCIONES_INSPECCION[i].docs.length; j++) {
        var d = SECCIONES_INSPECCION[i].docs[j];
        if (d[0] === tipo || (d[2] || []).indexOf(tipo) >= 0) return d;
      }
    }
  }

  function documentoInspeccion(tipo) {
    var existentes = store.byDg('documentosInspeccion');
    var def = definicionInspeccion(tipo);
    var doc = def ? existentes.filter(function (d) { return d.tipoInspeccion === def[0] || (def[2] || []).indexOf(d.tipoInspeccion) >= 0; })[0] :
      existentes.filter(function (d) { return d.tipoInspeccion === tipo; })[0];
    if (!doc && !def) return;
    doc = doc || { id: D.nextId(), e: store.dg().id, tipoInspeccion: def[0], codigo: 'INS-DOC-' + String(Date.now()).slice(-6), nombre: def[1], tipo: 'Otro', version: 1 };
    global.BPAPLUS.drive.filePanel(doc, store.dg().id, function (saved) { return store.save('documentosInspeccion', saved); });
  }

  function otroDocumentoInspeccion(seccionId) {
    var seccion = SECCIONES_INSPECCION.filter(function (s) { return s.id === seccionId; })[0];
    if (!seccion) return;
    var m = UI.dialog({
      title: 'Otro documento · ' + seccion.titulo,
      body: '<div class="field" id="wrap_nombre"><label for="ins_otro_titulo">Título del documento</label><input class="inp" id="ins_otro_titulo" placeholder="Ej. Relación de vehículos"><div class="err">Ingresa un título.</div></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="ins_otro_save">Continuar</button>',
      onMount: function (root) {
        var input = root.querySelector('#ins_otro_titulo'); input.focus();
        root.querySelector('#ins_otro_save').onclick = function () {
          var titulo = input.value.trim();
          if (!titulo) { root.querySelector('#wrap_nombre').classList.add('invalid'); input.focus(); return; }
          var doc = { id: D.nextId(), e: store.dg().id, tipoInspeccion: 'otro-' + D.nextId(), seccion: seccion.id, nombre: titulo, codigo: 'INS-OTR-' + String(Date.now()).slice(-6), tipo: 'Otro', version: 1 };
          m.close(); global.BPAPLUS.drive.filePanel(doc, store.dg().id, function (saved) { return store.save('documentosInspeccion', saved); });
        };
      }
    });
  }

  function vDocumentosInspeccion() {
    var docs = store.byDg('documentosInspeccion');
    function existente(def) { return docs.filter(function (d) { return d.tipoInspeccion === def[0] || (def[2] || []).indexOf(d.tipoInspeccion) >= 0; })[0]; }
    function fila(d, titulo, tipo) {
      var loaded = d && d.file;
      return '<div class="row"><div class="row-top" style="cursor:default"><div class="chan insp"></div><div class="row-main">' +
        '<div class="row-name">' + esc(titulo) + '</div><div class="row-meta">' + (loaded ? esc(d.file.name) : 'PDF, Word o Excel · máximo 25 MB') + '</div></div>' +
        '<div class="row-side">' + tag(loaded ? 'vigente' : 'pendiente', loaded ? 'Cargado' : 'Pendiente') + '</div></div>' +
        '<div class="row-foot">' + (loaded ? '<button class="btn btn-ghost btn-sm" data-ins-preview="' + d.id + '">' + icon('doc', 14) + 'Vista previa</button>' : '') +
        '<button class="btn btn-primary btn-sm" data-ins-upload="' + (tipo || d.tipoInspeccion) + '">' + icon('upload', 14) + (loaded ? 'Reemplazar' : 'Cargar') + '</button>' +
        (loaded ? '<button class="btn btn-danger btn-sm" data-ins-delete="' + d.id + '">' + icon('trash', 14) + 'Eliminar</button>' : '') + '</div></div>';
    }
    var requeridos = []; SECCIONES_INSPECCION.forEach(function (s) { requeridos = requeridos.concat(s.docs); });
    var cargados = requeridos.filter(function (d) { var x = existente(d); return x && x.file; }).length;
    var conocidos = {}; requeridos.forEach(function (d) { conocidos[d[0]] = true; (d[2] || []).forEach(function (a) { conocidos[a] = true; }); });
    var legacySection = { 'ficha-ruc': 'resoluciones', 'resoluciones-bpa': 'resoluciones' };
    return '<div class="inspection-docs"><div class="view-header"><div><div class="view-title">Documentos de inspección</div>' +
      '<div class="view-sub">' + cargados + ' de ' + requeridos.length + ' requeridos cargados · ' + esc(store.dg().nombre) + '</div></div></div>' +
      '<div class="progress"><div class="progress-top"><span>Expediente documental</span><strong>' + cargados + '/' + requeridos.length + '</strong></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + Math.round(cargados / requeridos.length * 100) + '%"></div></div></div>' +
      '<div class="inspection-groups">' + SECCIONES_INSPECCION.map(function (seccion) {
        var otros = docs.filter(function (d) { return !conocidos[d.tipoInspeccion] && (d.seccion === seccion.id || legacySection[d.tipoInspeccion] === seccion.id); });
        return '<section class="inspection-group"><div class="inspection-group-head"><h2>' + esc(seccion.titulo) + '</h2>' +
          '<button class="btn btn-ghost" data-ins-other="' + seccion.id + '">' + icon('plus', 16) + 'Otro documento</button></div>' +
          '<div class="list">' + seccion.docs.map(function (def) { return fila(existente(def), def[1], def[0]); }).join('') +
          otros.map(function (d) { return fila(d, d.nombre); }).join('') + '</div></section>';
      }).join('') + '</div></div>';
  }

  /* ===================================================================== *
   *  INFORMACIÓN DEL ALMACÉN
   * ===================================================================== */
  function vInformacionAlmacen() {
    var d = store.dg();
    return '<div class="view-header"><div><div class="view-title">Información del almacén</div>' +
      '<div class="view-sub">Datos declarados · ' + esc(d.nombre) + '</div></div></div>' +
      '<form id="infoAlmacenForm" class="inspection-group warehouse-info" novalidate>' +
        '<div class="grid-2"><div class="field" id="wrap_ia_razon"><label for="ia_razon">Razón social</label><input class="inp" id="ia_razon" value="' + esc(d.nombre) + '"><div class="err">Ingresa la razón social.</div></div>' +
        '<div class="field"><label for="ia_comercial">Nombre comercial</label><input class="inp" id="ia_comercial" value="' + esc(d.nombreComercial || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field" id="wrap_ia_ruc"><label for="ia_ruc">RUC</label><input class="inp mono" id="ia_ruc" inputmode="numeric" maxlength="11" value="' + esc(d.ruc || '') + '"><div class="err">Ingresa un RUC de 11 dígitos.</div></div>' +
        '<div class="field"><label for="ia_dt">Director técnico</label><input class="inp" id="ia_dt" value="' + esc(d.dt || '') + '"></div></div>' +
        '<div class="field"><label for="ia_direccion">Dirección</label><input class="inp" id="ia_direccion" value="' + esc(d.direccion || '') + '"></div>' +
        '<div class="field"><label for="ia_direccion_almacen">Dirección del almacén</label><input class="inp" id="ia_direccion_almacen" value="' + esc(d.direccionAlmacen || '') + '"></div>' +
        '<div class="grid-2"><div class="field"><label for="ia_area">Área del almacén declarada (m²)</label><input class="inp" id="ia_area" type="number" min="0" step="0.01" value="' + esc(d.areaAlmacen || '') + '"></div>' +
        '<div class="field"><label for="ia_cuarentena">Tipo de cuarentena</label><input class="inp" id="ia_cuarentena" value="' + esc(d.tipoCuarentena || '') + '"></div></div>' +
        '<div class="field"><label for="ia_almacenamiento">Tipo de almacenamiento</label><select class="inp" id="ia_almacenamiento"><option' + (d.tipoAlmacenamiento !== 'Tercerizado' ? ' selected' : '') + '>Propio</option><option' + (d.tipoAlmacenamiento === 'Tercerizado' ? ' selected' : '') + '>Tercerizado</option></select></div>' +
        '<div class="warehouse-actions"><button class="btn btn-primary" id="ia_save" type="submit">' + icon('check', 16) + 'Guardar información</button></div>' +
      '</form>';
  }

  function guardarInformacionAlmacen(form) {
    form.querySelectorAll('.invalid').forEach(function (x) { x.classList.remove('invalid'); });
    var razon = form.querySelector('#ia_razon').value.trim(), ruc = form.querySelector('#ia_ruc').value.trim();
    if (!razon) { form.querySelector('#wrap_ia_razon').classList.add('invalid'); form.querySelector('#ia_razon').focus(); return; }
    if (ruc && !/^\d{11}$/.test(ruc)) { form.querySelector('#wrap_ia_ruc').classList.add('invalid'); form.querySelector('#ia_ruc').focus(); return; }
    var button = form.querySelector('#ia_save'); button.disabled = true; button.textContent = 'Guardando…';
    var obj = Object.assign({}, store.dg(), {
      nombre: razon, nombreComercial: form.querySelector('#ia_comercial').value.trim(), ruc: ruc,
      direccion: form.querySelector('#ia_direccion').value.trim(), direccionAlmacen: form.querySelector('#ia_direccion_almacen').value.trim(),
      areaAlmacen: form.querySelector('#ia_area').value, tipoCuarentena: form.querySelector('#ia_cuarentena').value.trim(),
      dt: form.querySelector('#ia_dt').value.trim(), tipoAlmacenamiento: form.querySelector('#ia_almacenamiento').value,
      init: razon.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase()
    });
    store.save('droguerias', obj).then(function () { UI.note('Información del almacén guardada'); })
      .catch(function () { button.disabled = false; button.textContent = 'Guardar información'; });
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
          '<button class="btn btn-ghost" data-action="fmt-cap">' + icon('settings', 16) + 'Formato de asistencia</button>' +
          '<button class="btn btn-ghost" data-action="cron-cap">' + icon('upload', 16) + 'Importar cronograma</button>' +
          '<button class="btn btn-primary" data-action="nueva-cap">' + icon('plus', 16) + 'Nueva</button></div></div>' +
      '<div class="progress" style="margin-bottom:14px"><div class="progress-top"><span>Avance del programa anual</span><strong>' + pct + '%</strong></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>' +
      filterPills(S.filtCap, [
        { v: 'todos', l: 'Todas', c: counts.todos }, { v: 'pendiente', l: 'Pendientes', c: counts.pendiente },
        { v: 'realizada', l: 'Realizadas', c: counts.realizada }, { v: 'vencida', l: 'Vencidas', c: counts.vencida }
      ], 'data-fcap') +
      (caps.length ? '<div class="list">' + caps.map(capRow).join('') + '</div>'
        : emptyState('cap', 'Sin capacitaciones', all.length ? 'Ninguna capacitación coincide con el filtro.' : 'Programá tu primera capacitación del año.'));
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
    var conocidos = {}, guardados = [];
    store.byDg('capacitaciones').forEach(function (cap) {
      (cap.capacitados || []).forEach(function (p) {
        var key = D.normTxt(p.nombre || '').replace(/\s+/g, ' ').trim();
        if (key) conocidos[key] = { nombre: p.nombre, cargo: p.cargo || '' };
      });
    });
    Object.keys(conocidos).forEach(function (key) { guardados.push(conocidos[key]); });
    guardados.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
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
        '<div id="c_format_fields"></div>' +
        '<div class="field"><label>Participantes</label>' +
        (guardados.length ? '<div class="mini-row"><select class="inp" id="c_known"><option value="">Seleccionar participante guardado…</option>' + guardados.map(function (p, i) { return '<option value="' + i + '">' + esc(p.nombre) + (p.cargo ? ' · ' + esc(p.cargo) : '') + '</option>'; }).join('') + '</select>' +
          '<button class="btn btn-ghost btn-sm" id="c_add_known" type="button">' + icon('plus', 14) + 'Agregar</button></div>' : '') +
        '<div id="attList">' + attHtml + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="c_add" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar participante nuevo</button></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="c_save">Guardar</button>',
      onMount: function (root) {
        var list = root.querySelector('#attList');
        var addKnown = root.querySelector('#c_add_known');
        if (addKnown) addKnown.onclick = function () {
          var select = root.querySelector('#c_known'), p = guardados[+select.value]; if (!p) return;
          var repeated = Array.prototype.some.call(list.querySelectorAll('.att-nom'), function (input) { return D.normTxt(input.value) === D.normTxt(p.nombre); });
          if (repeated) { UI.note('Ese participante ya está agregado.'); return; }
          var div = document.createElement('div'); div.innerHTML = attRow({ nombre: p.nombre, cargo: p.cargo, nota: '' }); list.appendChild(div.firstChild); select.value = '';
        };
        var fmt = global.BPAPLUS.formatos && global.BPAPLUS.formatos.para(store.dg(), 'capacitaciones');
        var box = root.querySelector('#c_format_fields'), requiredReady = !fmt;
        if (fmt) {
          box.innerHTML = '<div class="hint">Analizando los campos del formato de asistencia…</div>';
          global.BPAPLUS.drive.camposRequeridos(fmt).then(function (fields) {
            box.innerHTML = fields.length ? '<div class="section-title">Datos requeridos por el formato de asistencia</div>' + fields.map(function (field) {
              var value = (c.datosFormato || {})[field.key]; if (value == null) value = field.value;
              return '<div class="field"><label>' + esc(field.label) + '</label><input class="inp c-format-field" data-format-key="' + esc(field.key) + '" type="' + (field.type || 'text') + '" value="' + esc(value) + '"></div>';
            }).join('') : '';
            requiredReady = true;
          }).catch(function () { box.innerHTML = '<div class="hint">No se pudieron analizar los campos adicionales del formato.</div>'; requiredReady = true; });
        }
        root.querySelector('#c_add').onclick = function () { var div = document.createElement('div'); div.innerHTML = attRow({ nombre: '', cargo: '' }); list.appendChild(div.firstChild); };
        list.addEventListener('click', function (e) { var b = e.target.closest('[data-delatt]'); if (b) b.closest('.mini-row').remove(); });
        root.querySelector('#c_save').onclick = function () {
          if (!requiredReady) { UI.note('Esperá un momento: todavía se está analizando el formato de asistencia.'); return; }
          var tema = root.querySelector('#c_tema').value.trim();
          if (!tema) { root.querySelector('#wrap_tema').classList.add('invalid'); root.querySelector('#c_tema').focus(); return; }
          var att = Array.prototype.map.call(list.querySelectorAll('.mini-row'), function (r) {
            var nota = r.querySelector('.att-nota').value;
            return { nombre: r.querySelector('.att-nom').value.trim(), cargo: r.querySelector('.att-cargo').value.trim(), nota: nota === '' ? '' : +nota };
          }).filter(function (a) { return a.nombre; });
          if (att.some(function (a) { return a.nota !== '' && (!Number.isInteger(a.nota) || a.nota < 0 || a.nota > 20); })) {
            UI.note('Cada nota debe ser un número entero de 0 a 20.'); return;
          }
          var obj = Object.assign({}, existing || {}, {
            id: existing ? existing.id : D.nextId(), e: store.dg().id,
            tema: tema, area: root.querySelector('#c_area').value, frec: root.querySelector('#c_frec').value,
            fecha: root.querySelector('#c_fecha').value || D.isoHoy(),
            est: existing ? existing.est : 'pendiente', capacitados: att,
            materiales: (existing && existing.materiales) || [], datosFormato: Object.assign({}, c.datosFormato || {})
          });
          root.querySelectorAll('.c-format-field').forEach(function (input) { obj.datosFormato[input.dataset.formatKey] = input.value.trim(); });
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
      '<input class="inp att-nota" type="number" min="0" max="20" step="1" placeholder="Nota / 20" aria-label="Nota de evaluación" value="' + esc(p.nota == null ? '' : p.nota) + '" style="max-width:100px">' +
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
            '<span><b>' + esc(f.name || 'archivo') + '</b><small>Vista previa</small></span></button>';
        }).join('') + '</div>' : '<div class="row-empty">Sin material cargado. Editá la capacitación para subirlo.</div>') +
        '<div class="section-title">Participantes (' + att.length + ')</div>' +
        (att.length ? att.map(function (p) { return '<div class="att-item"><div class="att-nombre">' + esc(p.nombre) + '</div><div class="att-cargo">' + esc(p.cargo || '—') + (p.nota == null || p.nota === '' ? '' : ' · Nota: ' + esc(p.nota) + '/20') + '</div></div>'; }).join('')
          : '<div class="row-empty">Sin participantes registrados.</div>'),
      footer:
        '<button class="btn btn-ghost" data-acta>' + icon('print', 16) + 'Acta de asistencia</button>' +
        '<button class="btn btn-ghost" data-eval>' + icon('check', 16) + 'Evaluación</button>' +
        '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
        '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>',
      onMount: function (root) {
        root.querySelector('[data-acta]').onclick = function () { actas.actaAsistencia(store.dg(), c); };
        root.querySelectorAll('[data-mat]').forEach(function (b) {
          b.onclick = function () {
            global.BPAPLUS.drive.previewStored(mats[+b.dataset.mat]).catch(function (e) { UI.note(e.message || e); });
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
    var tieneFormato = !!c.formatoEvaluacion;
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
          : (tieneFormato
            ? '<div class="row-empty">El formato de evaluación está listo para emitirse con los nombres y notas de los participantes.</div>'
            : '<div class="row-empty">Todavía no hay evaluación. Se generan 5 preguntas de alternativa múltiple con el tema y, si cargaste material, con su contenido.</div>')) + '</div>',
      footer:
        '<button class="btn btn-primary" data-gen>' + icon('cap', 16) + (c.evaluacion ? 'Regenerar' : 'Generar evaluación') + '</button>' +
        '<button class="btn btn-ghost" data-formato-eval>' + icon('upload', 16) + (tieneFormato ? 'Cambiar formato' : 'Cargar formato') + '</button>' +
        (c.evaluacion || tieneFormato ? '<button class="btn btn-ghost" data-print>' + icon('print', 16) + 'Emitir para participantes</button>' : ''),
      onMount: function (root) {
        root.querySelector('[data-formato-eval]').onclick = function () { formatoEvaluacionPanel(c); };
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
          '<button class="btn btn-ghost" data-goto="documentos-inspeccion">' + icon('doc', 16) + 'Documentos</button>' +
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
        : emptyState('insp', 'Sin autoinspecciones', all.length ? 'Ninguna coincide con el filtro.' : 'Programá tu primera autoinspección.'));
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
    var destino = store.find('inspecciones', a.inspeccionId);
    return '<div class="row" data-acta="' + a.id + '"><div class="row-top"><div class="chan insp"></div><div class="row-main">' +
      '<div class="row-name">Acta N.° ' + esc(a.numActa || '—') + ' · Inspección al almacén</div>' +
      '<div class="row-meta"><span>' + esc(D.fLocal(a.fecha)) + (a.auditor ? ' · ' + esc(a.auditor) : '') + esc(hallTxt) + esc(pasoTxt) + (destino ? ' · ' + esc(destino.area) : '') + '</span></div></div>' + tag(cls, label) + '</div></div>';
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
    var archivos = store.byDg('documentosInspeccion').filter(function (d) { return d.inspeccionId === i.id && d.file; });
    var actasVinculadas = store.byDg('actas').filter(function (a) { return a.inspeccionId === i.id; });
    UI.panel({
      title: 'Autoinspección',
      body:
        '<div class="panel-lead-title" style="margin-bottom:12px">' + esc(i.area) + '</div>' +
        detailRow('Programada', D.fLocal(i.prog)) +
        (r ? detailRow('Realizada', D.fLocal(i.real)) + detailRow('Hallazgos abiertos', String(i.hall || 0)) : '') +
        (r && i.result ? '<div class="section-title">Resultado</div><p class="panel-text">' + esc(i.result) + '</p>' : '') +
        (r ? '<div class="section-title">Archivos (' + archivos.length + ')</div>' + (archivos.length ? '<div class="file-list">' + archivos.map(function (d) {
          return '<div class="file-item"><button class="link-btn" data-ai-preview="' + d.id + '">' + icon('doc', 16) + esc(d.nombre) + '</button><button class="icon-btn del" data-ai-delete="' + d.id + '" aria-label="Eliminar">' + icon('trash', 16) + '</button></div>';
        }).join('') + '</div>' : '<div class="row-empty">Sin archivos adjuntos.</div>') +
        '<div class="section-title">Actas vinculadas (' + actasVinculadas.length + ')</div>' + (actasVinculadas.length ? '<div class="file-list">' + actasVinculadas.map(function (a) {
          return '<button class="file-item" data-ai-acta="' + a.id + '">' + icon('insp', 16) + '<span><b>Acta N.° ' + esc(a.numActa || '—') + '</b><small>' + esc(D.fLocal(a.fecha)) + '</small></span></button>';
        }).join('') + '</div>' : '<div class="row-empty">Sin actas vinculadas.</div>') : ''),
      footer:
        (r ? '<button class="btn btn-primary" data-add-ai-file>' + icon('upload', 16) + 'Agregar archivo</button>' : '<button class="btn btn-primary" data-close-ins>' + icon('check', 16) + 'Registrar resultado</button>') +
        '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
        '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>',
      onMount: function (root) {
        var ce = root.querySelector('[data-close-ins]'); if (ce) ce.onclick = function () { root.querySelector('[data-close]').click(); inspCloseForm(i); };
        var addFile = root.querySelector('[data-add-ai-file]'); if (addFile) addFile.onclick = function () { root.querySelector('[data-close]').click(); archivoAutoinspeccion(i); };
        root.querySelectorAll('[data-ai-preview]').forEach(function (button) { button.onclick = function () { global.BPAPLUS.drive.previewStored(store.find('documentosInspeccion', button.dataset.aiPreview).file).catch(function (e) { UI.note(e.message || e); }); }; });
        root.querySelectorAll('[data-ai-delete]').forEach(function (button) { button.onclick = function () { var d = store.find('documentosInspeccion', button.dataset.aiDelete); root.querySelector('[data-close]').click(); store.removeWithUndo('documentosInspeccion', d, 'Archivo eliminado'); }; });
        root.querySelectorAll('[data-ai-acta]').forEach(function (button) { button.onclick = function () { root.querySelector('[data-close]').click(); actaForm(store.find('actas', button.dataset.aiActa)); }; });
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
    var destinos = store.byDg('inspecciones').slice().sort(function (x, y) { return (y.prog || '').localeCompare(x.prog || ''); });
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
        '<div class="field"><label>Autoinspección destino</label><select class="inp" id="a_insp"><option value="">Sin asignar</option>' + destinos.map(function (i) { return '<option value="' + esc(i.id) + '"' + (a.inspeccionId === i.id ? ' selected' : '') + '>' + esc(i.area + ' · ' + D.fLocal(i.prog) + (i.real ? ' · Realizada' : ' · Pendiente')) + '</option>'; }).join('') + '</select></div>' +
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
      a.inspeccionId = root.querySelector('#a_insp').value || '';
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
  /* El logo va como data URI dentro de la droguería: viaja con ella a otros
     dispositivos y se imprime sin conexión, que es cuando hace falta. */
  function leerLogo(arch) {
    if (!arch) return Promise.resolve(null);
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onload = function () { res(String(rd.result)); };
      rd.onerror = function () { rej(rd.error); };
      rd.readAsDataURL(arch);
    });
  }

  function dgForm(existing) {
    var e = existing || { nombre: '', ruc: '', direccion: '', dt: '', criterios: D.CRITERIOS_DEFAULT.slice() };
    var m = UI.dialog({
      title: existing ? 'Editar droguería' : 'Nueva droguería',
      body:
        '<div class="field" id="wrap_en"><label>Razón social</label><input class="inp" id="e_nom" value="' + esc(e.nombre) + '"><div class="err">Ingresá la razón social.</div></div>' +
        '<div class="grid-2"><div class="field"><label>RUC</label><input class="inp mono" id="e_ruc" value="' + esc(e.ruc) + '" maxlength="11"></div>' +
        '<div class="field"><label>Director técnico</label><input class="inp" id="e_dt" value="' + esc(e.dt || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Cargo del D.T. (sello)</label><input class="inp" id="e_dtc" value="' + esc(e.dtCargo || '') + '" placeholder="D.T QUIMICO FARMACEUTICO"></div>' +
        '<div class="field"><label>Colegiatura (sello)</label><input class="inp mono" id="e_dtn" value="' + esc(e.dtColegiatura || '') + '" placeholder="CQFP 29902"></div></div>' +
        '<div class="field"><label>Dirección</label><input class="inp" id="e_dir" value="' + esc(e.direccion || '') + '"></div>' +
        '<div class="grid-2"><div class="field"><label>Teléfono</label><input class="inp" id="e_tel" value="' + esc(e.telefono || '') + '"></div>' +
        '<div class="field"><label>Correo</label><input class="inp" id="e_mail" value="' + esc(e.email || '') + '"></div></div>' +
        '<div class="field"><label>Web</label><input class="inp" id="e_web" value="' + esc(e.web || '') + '"><div class="hint">Dirección, teléfono, correo y web salen en el pie de página del expediente de retiro.</div></div>' +
        '<div class="field"><label>Logo del membrete</label><input class="inp" id="e_logo" type="file" accept="image/png,image/jpeg,image/svg+xml">' +
          '<div class="hint">' + (e.logo ? 'Ya hay un logo cargado. ' : '') +
          'Sale arriba en las actas y en el expediente de retiro. PNG, JPG o SVG de menos de 300 KB.</div></div>',
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
            direccion: root.querySelector('#e_dir').value.trim(), init: init,
            dtCargo: root.querySelector('#e_dtc').value.trim(), dtColegiatura: root.querySelector('#e_dtn').value.trim(),
            telefono: root.querySelector('#e_tel').value.trim(), email: root.querySelector('#e_mail').value.trim(),
            web: root.querySelector('#e_web').value.trim()
          });
          var arch = root.querySelector('#e_logo').files[0];
          if (arch && arch.size >= 300 * 1024) { UI.note('El logo debe pesar menos de 300 KB.'); return; }
          leerLogo(arch).then(function (logo) {
            if (logo) obj.logo = logo;
            return store.save('droguerias', obj);
          }).then(function () {
            if (!existing) store.setDg(obj.id);
            m.close(); UI.note(existing ? 'Droguería actualizada' : 'Droguería creada'); store.renderChrome();
          }).catch(function () { UI.note('No se pudo leer el logo.'); });
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
      { sep: true },
      { label: 'Nueva droguería…', icon: 'plus', onClick: function () { dgForm(null); } },
      { label: 'Información del almacén…', icon: 'building', onClick: function () { store.go('informacion-almacen'); } },
      { label: 'Editar droguería actual…', icon: 'edit', onClick: function () { dgForm(store.dg()); } },
      { label: 'Editar criterios de clasificación…', icon: 'settings', onClick: function () { criteriosForm(); } },
      { label: 'Cambiar PIN…', icon: 'settings', onClick: function () { global.BPAPLUS.lock.openSettings(); } }
    ]), document.getElementById('dgSwitch'));
  }

  function criteriosForm() {
    var e = store.dg();
    var crit = (e.criterios || D.CRITERIOS_DEFAULT).slice();
    var siglas = e.siglas || {}, base = global.BPAPLUS.drive.SIGLAS_BASE;
    function rowsHtml() {
      return crit.map(function (c) { return '<div class="mini-row"><input class="inp crit-inp" value="' + esc(c) + '"><button class="icon-btn" type="button" data-delc aria-label="Quitar">' + icon('x', 16) + '</button></div>'; }).join('');
    }
    function siglasHtml() {
      return Object.keys(siglas).sort().map(function (sg) {
        var k = siglas[sg].k;
        return '<div class="mini-row sig-row" data-sigla="' + esc(sg) + '"><b class="mono" style="min-width:52px">' + esc(sg) + '</b>' +
          '<input class="inp sig-s" value="' + esc(siglas[sg].s) + '" aria-label="Significado de ' + esc(sg) + '">' +
          '<select class="inp sig-k" style="flex:none;width:auto" aria-label="Qué nombra ' + esc(sg) + '"><option value="tipo"' + (k === 'tipo' ? ' selected' : '') + '>Categoría</option><option value="area"' + (k === 'area' ? ' selected' : '') + '>Área</option></select>' +
          '<button class="icon-btn" type="button" data-delc aria-label="Quitar">' + icon('x', 16) + '</button></div>';
      }).join('') || '<div class="row-empty">Ninguna todavía: se agregan al escanear documentos con siglas que la app no conoce.</div>';
    }
    var m = UI.dialog({
      title: 'Criterios de clasificación',
      body: '<p class="dialog-note">Los documentos se agrupan automáticamente en estas categorías según su código o nombre.</p>' +
        '<div id="critList">' + rowsHtml() + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="critAdd" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar criterio</button>' +
        '<div class="section-title">Siglas de los códigos</div>' +
        '<p class="dialog-note">Ya incluidas: ' + esc(Object.keys(base).filter(function (sg) { return !siglas[sg] && D.normTxt(base[sg].s) !== D.normTxt(sg); }).map(function (sg) { return sg + ' ' + base[sg].s; }).join(' · ')) + '.</p>' +
        '<div id="sigList">' + siglasHtml() + '</div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="critSave">Guardar</button>',
      onMount: function (root) {
        var list = root.querySelector('#critList');
        root.querySelector('#critAdd').onclick = function () { var d = document.createElement('div'); d.innerHTML = '<div class="mini-row"><input class="inp crit-inp" value=""><button class="icon-btn" type="button" data-delc aria-label="Quitar">' + icon('x', 16) + '</button></div>'; list.appendChild(d.firstChild); };
        root.addEventListener('click', function (ev) { var b = ev.target.closest('[data-delc]'); if (b) b.closest('.mini-row').remove(); });
        root.querySelector('#critSave').onclick = function () {
          var vals = Array.prototype.map.call(list.querySelectorAll('.crit-inp'), function (x) { return x.value.trim(); }).filter(Boolean);
          var sig = {};
          Array.prototype.forEach.call(root.querySelectorAll('.sig-row'), function (r) {
            var s = r.querySelector('.sig-s').value.trim();
            if (s) sig[r.dataset.sigla] = { s: s.slice(0, 60), k: r.querySelector('.sig-k').value };
          });
          store.save('droguerias', Object.assign({}, e, { criterios: vals.length ? vals : D.CRITERIOS_DEFAULT.slice(), siglas: sig })).then(function () { m.close(); UI.note('Criterios actualizados'); });
        };
      }
    });
  }

  /* ===================================================================== *
   *  Registro + despacho de vistas
   * ===================================================================== */
  var RENDERERS = {
    dashboard: vDashboard, documentos: vDocumentos, 'documentos-inspeccion': vDocumentosInspeccion, 'informacion-almacen': vInformacionAlmacen, capacitaciones: vCapacitaciones,
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

  function formatoEvaluacionPanel(cap) {
    var holder = { id: cap.id, nombre: cap.tema, formatos: cap.formatoEvaluacion ? [cap.formatoEvaluacion] : [] };
    global.BPAPLUS.formatos.manage(holder, 'evaluaciones', function (next) {
      cap.formatoEvaluacion = global.BPAPLUS.formatos.para(next, 'evaluaciones');
      return store.save('capacitaciones', Object.assign({}, cap));
    }, {
      nombre: cap.tema,
      path: 'droguerias/' + store.dg().id + '/capacitaciones/' + cap.id + '/formato-evaluacion'
    });
  }

  function archivoAutoinspeccion(i) {
    var m = UI.dialog({
      title: 'Agregar archivo a la autoinspección',
      body: '<div class="field" id="wrap_ai_title"><label>Título del archivo</label><input class="inp" id="ai_title" placeholder="Ej. Evidencia fotográfica"><div class="err">Ingresa un título.</div></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="ai_continue">Continuar</button>',
      onMount: function (root) {
        var input = root.querySelector('#ai_title'); input.focus();
        root.querySelector('#ai_continue').onclick = function () {
          var title = input.value.trim(); if (!title) { root.querySelector('#wrap_ai_title').classList.add('invalid'); return; }
          var doc = { id: D.nextId(), e: store.dg().id, inspeccionId: i.id, tipoInspeccion: 'autoinspeccion-' + i.id + '-' + D.nextId(), nombre: title, codigo: 'INS-ADJ-' + String(Date.now()).slice(-6), tipo: 'Otro', version: 1 };
          m.close(); global.BPAPLUS.drive.filePanel(doc, store.dg().id, function (saved) { return store.save('documentosInspeccion', saved); });
        };
      }
    });
  }

  function bind(container) {
    container.addEventListener('click', function (e) {
      var t = e.target;
      var det = t.closest('[data-doc-detail]');
      if (det) return docDetailClick(e, store.find('documentos', det.dataset.docDetail), cerrarDetalle, true);
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
        if (a === 'alertas') return global.BPAPLUS.alerts.open();
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
      var dr = t.closest('[data-doc]'); if (dr) return abrirDoc(store.find('documentos', dr.dataset.doc));
      var io = t.closest('[data-ins-other]'); if (io) return otroDocumentoInspeccion(io.dataset.insOther);
      var iu = t.closest('[data-ins-upload]'); if (iu) return documentoInspeccion(iu.dataset.insUpload);
      var idl = t.closest('[data-ins-preview]'); if (idl) return global.BPAPLUS.drive.previewStored(store.find('documentosInspeccion', idl.dataset.insPreview).file).catch(function (err) { UI.note(err.message || err); });
      var ide = t.closest('[data-ins-delete]'); if (ide) return store.removeWithUndo('documentosInspeccion', store.find('documentosInspeccion', ide.dataset.insDelete), 'Documento de inspección eliminado');
      var cr = t.closest('[data-cap]'); if (cr) return capPanel(store.find('capacitaciones', cr.dataset.cap));
      var ir = t.closest('[data-insp]'); if (ir) return inspPanel(store.find('inspecciones', ir.dataset.insp));
      var ar = t.closest('[data-acta]'); if (ar) return actaForm(store.find('actas', ar.dataset.acta));
    });
    container.addEventListener('input', function (e) {
      if (e.target.id === 'qDoc') { store.state.qDoc = e.target.value; store.renderInto(); }
    });
    // Las filas de documento son foco de teclado: Enter o espacio las abren como un clic.
    container.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.row[data-doc]')) { e.preventDefault(); e.target.click(); }
    });
    /* Escape cierra el detalle de la vista dividida, salvo que haya un diálogo o menú encima. En
       captura, para mirar antes de que ui.js cierre ese diálogo con la misma tecla. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.querySelector('.doc-detail') && !document.querySelector('.dialog, .panel, .picker, .finder')) cerrarDetalle();
    }, true);
    container.addEventListener('submit', function (e) {
      if (e.target.id === 'infoAlmacenForm') { e.preventDefault(); guardarInformacionAlmacen(e.target); }
    });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.views = {
    setStore: function (s) { store = s; }, render: render, bind: bind,
    open: { docForm: docForm, capForm: capForm, inspForm: inspForm, actaForm: actaForm, dgSwitcher: dgSwitcher, dgForm: dgForm, criteriosForm: criteriosForm,
      formatoActa: formatoActaDescarga, cargarActa: cargarActaLlenada, documentoInspeccion: documentoInspeccion },
    panels: { docPanel: abrirDoc, capPanel: capPanel, inspPanel: inspPanel }
  };
})(window);
