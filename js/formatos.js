/* ==========================================================================
   BPA-Plus — formatos.js
   Formatos propios de cada droguería. Se carga el formato en blanco que ya
   usa (XLSX, DOCX o PDF), se revisa qué dato de la app llena cada campo y
   cada columna, y desde ahí las actas de capacitación y de autoinspección
   salen con ESE formato en vez del genérico.

   La configuración vive dentro de la droguería (`dg.formatos`), no en un
   store nuevo: así se sincroniza, se respalda y se borra junto con ella sin
   tocar db.js, app.js ni las reglas de Firestore. El archivo original se
   guarda en Storage sólo como respaldo; lo que llena las actas es la
   configuración.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, UI = global.BPAPLUS.ui, esc = UI.esc, icon = UI.icon;

  var MODULOS = { capacitaciones: 'Capacitaciones', inspecciones: 'Autoinspecciones' };

  /* Origen de cada dato: qué pone la app en ese campo / esa columna del formato. */
  var CAMPOS = [
    ['', '— en blanco —'], ['tema', 'Tema / actividad'], ['fecha', 'Fecha'], ['area', 'Área'],
    ['frec', 'Frecuencia'], ['expositor', 'Expositor / director técnico'], ['empresa', 'Razón social'],
    ['ruc', 'RUC'], ['direccion', 'Dirección / lugar'], ['auditor', 'Auditor'],
    ['numActa', 'N.° de acta'], ['cumplimiento', '% de cumplimiento'], ['hallazgos', 'Hallazgos (crít./may./men.)']
  ];
  var COLUMNAS = [
    ['', '— en blanco —'], ['indice', 'N.° correlativo'], ['nombre', 'Nombre del participante'],
    ['dni', 'DNI'], ['cargo', 'Cargo'], ['areaP', 'Área del participante'],
    ['texto', 'Ítem evaluado'], ['seccion', 'Sección'], ['si', 'Cumple (Sí)'], ['no', 'No cumple'],
    ['severidad', 'Severidad'], ['obs', 'Observación']
  ];

  /* Sinónimos para adivinar el origen al leer el formato. El usuario corrige lo
     que salga mal en el diálogo de configuración; esto sólo ahorra tipeo. */
  var ALIAS_CAMPO = [
    ['tema', ['tema', 'curso', 'actividad', 'charla', 'capacitacion']],
    ['fecha', ['fecha']],
    ['frec', ['frecuencia', 'periodicidad']],
    ['expositor', ['expositor', 'capacitador', 'instructor', 'facilitador', 'ponente', 'docente', 'responsable', 'director tecnico']],
    ['empresa', ['empresa', 'razon social', 'drogueria', 'establecimiento']],
    ['ruc', ['ruc']],
    ['direccion', ['direccion', 'lugar', 'sede', 'local', 'ambiente']],
    ['auditor', ['auditor', 'inspector']],
    ['numActa', ['acta']],
    ['area', ['area', 'unidad', 'servicio', 'departamento']]
  ];
  var ALIAS_COL = [
    ['nombre', ['nombre', 'apellido', 'participante', 'trabajador', 'personal', 'asistente', 'colaborador']],
    ['dni', ['dni', 'documento', 'identidad', 'cedula']],
    ['cargo', ['cargo', 'puesto', 'funcion', 'ocupacion']],
    ['severidad', ['severidad', 'criticidad', 'riesgo']],
    ['obs', ['observacion', 'comentario', 'nota']],
    ['texto', ['asunto', 'requisito', 'aspecto', 'criterio', 'descripcion', 'hallazgo']],
    ['seccion', ['seccion', 'capitulo']],
    ['areaP', ['area', 'unidad']],
    ['no', ['no cumple', 'no conforme', 'no']],
    ['si', ['cumple', 'conforme', 'si']],
    ['indice', ['n', 'nro', 'num', 'item', 'orden']]
  ];
  var COLS_DEFAULT = [
    { label: 'N.°', key: 'indice' }, { label: 'Nombres y apellidos', key: 'nombre' },
    { label: 'Cargo', key: 'cargo' }, { label: 'Firma', key: '' }
  ];
  var TITULO_HINT = /(asistencia|acta|registro|formato|capacitacion|inspeccion|constancia|control)/;

  function norm(s) { return D.normTxt(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  /* Alias de 3 letras o menos («n», «si», «no») sólo por coincidencia exacta:
     por substring «no» matchearía «nombre» y «si» matchearía «firma». */
  function guess(label, table) {
    var n = norm(label);
    if (!n) return '';
    for (var i = 0; i < table.length; i++) {
      var alias = table[i][1];
      for (var j = 0; j < alias.length; j++) {
        var a = alias[j];
        if (a.length <= 3 ? n === a : n.indexOf(a) >= 0) return table[i][0];
      }
    }
    return '';
  }

  /* Las celdas fusionadas vienen repetidas desde rowsFromXlsx: se colapsan. */
  function celdas(row) {
    return (row || []).map(function (c) { return String(c == null ? '' : c).trim(); })
      .filter(function (t, i, a) { return t && t !== a[i - 1]; });
  }

  /* ------------------------------ Lectura del formato en blanco ------------------------------ */
  function parse(read, fileName, modulo) {
    var rows = read.rows || [], text = read.text || '';

    // Cabecera de la tabla: la fila con más celdas reconocibles como columna.
    var head = -1, best = 1;
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var cs = celdas(rows[i]);
      if (cs.length < 2) continue;
      var hits = cs.filter(function (c) { return guess(c, ALIAS_COL); }).length;
      if (hits > best) { best = hits; head = i; }
    }
    var columnas = head >= 0
      ? celdas(rows[head]).map(function (c) { return { label: c, key: guess(c, ALIAS_COL) }; })
      : COLS_DEFAULT.map(function (c) { return { label: c.label, key: c.key }; });

    // Campos: lo que arriba de la tabla parece una etiqueta («Tema:», «Fecha:»).
    var campos = [], vistos = {};
    function addCampo(label) {
      label = String(label).replace(/[:\s]+$/, '').trim();
      var k = norm(label);
      if (!k || label.length > 44 || vistos[k]) return;
      vistos[k] = 1;
      campos.push({ label: label, key: guess(label, ALIAS_CAMPO) });
    }
    var limite = head >= 0 ? head : Math.min(rows.length, 15);
    for (var r = 0; r < limite; r++) celdas(rows[r]).forEach(function (c) {
      // Un texto largo que menciona «capacitación» es el título, no una etiqueta.
      if (/:\s*$/.test(c) || (norm(c).length <= 24 && guess(c, ALIAS_CAMPO))) addCampo(c);
    });
    if (!campos.length) (text.match(/[^\n:]{3,44}:/g) || []).slice(0, 10).forEach(addCampo);

    // Título: preferimos el que suene a formato; si no, el primer texto largo.
    var cands = [];
    (head >= 0 ? rows.slice(0, head) : rows.slice(0, 8)).forEach(function (row) {
      celdas(row).forEach(function (c) { cands.push(c); });
    });
    if (!cands.length) cands = text.split('\n').slice(0, 8).map(function (l) { return l.trim(); });
    var libres = cands.filter(function (c) {
      return c.length >= 8 && c.length <= 90 && c.indexOf(':') < 0 && !(norm(c).length <= 24 && guess(c, ALIAS_CAMPO));
    });
    var titulo = libres.filter(function (c) { return TITULO_HINT.test(norm(c)); })[0] || libres[0] || '';

    var codigo = global.BPAPLUS.drive.codigoFromName(fileName) ||
      (text.match(/\b([A-Z]{2,4}-[A-Z]{2,4}-\d{2,4})\b/) || [])[1] || '';

    return {
      id: D.nextId(), modulo: modulo,
      nombre: titulo || String(fileName || 'Formato').replace(/\.[^.]+$/, ''),
      titulo: titulo || (modulo === 'inspecciones' ? 'Acta de autoinspección' : 'Registro de asistencia a capacitación'),
      codigo: codigo, version: (text.match(/versi[oó]n\s*[:.]?\s*(\d+)/i) || [])[1] || '',
      campos: campos, columnas: columnas, firmas: ['Expositor / capacitador', 'Director técnico'],
      minFilas: 0, archivo: null
    };
  }

  /* ------------------------------ Impresión con el formato de la droguería ------------------------------ */
  function para(dg, modulo) {
    return ((dg && dg.formatos) || []).filter(function (f) { return f.modulo === modulo; })[0] || null;
  }

  function render(fmt, valores, filas) {
    var cols = (fmt.columnas || []).length ? fmt.columnas : COLS_DEFAULT;
    var meta = (fmt.campos || []).map(function (c) {
      var v = c.key ? valores[c.key] : '';
      return '<div><b>' + esc(c.label) + ':</b> ' + esc(v == null ? '' : v) + '</div>';
    });
    if (fmt.codigo) meta.unshift('<div><b>Código:</b> ' + esc(fmt.codigo) + (fmt.version ? ' · v' + esc(fmt.version) : '') + '</div>');

    var cuerpo = (filas || []).map(function (f, i) {
      return '<tr>' + cols.map(function (c) {
        var v = c.key === 'indice' ? (i + 1) : (c.key ? f[c.key] : '');
        return '<td>' + esc(v == null ? '' : v) + '</td>';
      }).join('') + '</tr>';
    });
    for (var k = cuerpo.length; k < (+fmt.minFilas || 0); k++) {
      cuerpo.push('<tr>' + cols.map(function (c) {
        return '<td>' + (c.key === 'indice' ? (k + 1) : '&nbsp;') + '</td>';
      }).join('') + '</tr>');
    }
    if (!cuerpo.length) cuerpo.push('<tr><td colspan="' + cols.length + '" style="text-align:center;color:#888;padding:16px">Sin datos registrados</td></tr>');

    return '<h1>' + esc(fmt.titulo || 'Formato') + '</h1>' +
      (meta.length ? '<div class="acta-meta">' + meta.join('') + '</div>' : '') +
      '<table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + cuerpo.join('') + '</tbody></table>' +
      ((fmt.firmas || []).length
        ? '<div class="acta-firmas">' + fmt.firmas.map(function (s) { return '<div class="firma-line">' + esc(s) + '</div>'; }).join('') + '</div>'
        : '');
  }

  /* ------------------------------ Configuración de un formato ------------------------------ */
  function form(fmt, onOk) {
    var f = Object.assign({ campos: [], columnas: [], firmas: [] }, fmt);

    function selOpts(list, sel) {
      return list.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === (sel || '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('');
    }
    function miniRow(label, list, key) {
      return '<div class="mini-row"><input class="inp fm-lab" value="' + esc(label || '') + '" placeholder="Etiqueta">' +
        (list ? '<select class="inp fm-key" style="max-width:190px" aria-label="Dato que lo llena">' + selOpts(list, key) + '</select>' : '') +
        '<button class="icon-btn del" type="button" data-rm aria-label="Quitar">' + icon('x', 16) + '</button></div>';
    }
    function lista(items, list) {
      return items.map(function (it) {
        return list ? miniRow(it.label, list, it.key) : miniRow(it, null, null);
      }).join('');
    }

    var m = UI.dialog({
      title: 'Configurar formato', wide: true,
      body:
        '<p class="dialog-note">Cada campo y cada columna se llena con el dato que elijas. Lo que quede «en blanco» se imprime vacío para completar a mano.</p>' +
        '<div class="grid-2"><div class="field"><label>Nombre del formato</label><input class="inp" id="fm_nom" value="' + esc(f.nombre || '') + '"></div>' +
        '<div class="field"><label>Módulo</label><select class="inp" id="fm_mod">' +
          Object.keys(MODULOS).map(function (k) { return '<option value="' + k + '"' + (k === f.modulo ? ' selected' : '') + '>' + esc(MODULOS[k]) + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div class="field"><label>Título impreso</label><input class="inp" id="fm_tit" value="' + esc(f.titulo || '') + '"></div>' +
        '<div class="grid-2"><div class="field"><label>Código</label><input class="inp mono" id="fm_cod" value="' + esc(f.codigo || '') + '" placeholder="FOR-ALM-011"></div>' +
        '<div class="field"><label>Versión</label><input class="inp" id="fm_ver" value="' + esc(f.version || '') + '"></div></div>' +
        '<div class="field"><label>Campos de encabezado</label><div id="fm_campos">' + lista(f.campos, CAMPOS) + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="fm_addc" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar campo</button></div>' +
        '<div class="field"><label>Columnas de la tabla</label><div id="fm_cols">' + lista(f.columnas, COLUMNAS) + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="fm_addk" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar columna</button></div>' +
        '<div class="field"><label>Filas en blanco al final</label>' +
          '<input class="inp" id="fm_min" type="number" min="0" max="60" value="' + (+f.minFilas || 0) + '">' +
          '<div class="hint">Renglones vacíos para firmar a mano a quien no esté cargado.</div></div>' +
        '<div class="field"><label>Pies de firma</label><div id="fm_firmas">' + lista(f.firmas || [], null) + '</div>' +
        '<button class="btn btn-ghost btn-sm" id="fm_addf" type="button" style="margin-top:6px">' + icon('plus', 14) + 'Agregar firma</button></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="fm_save">Guardar formato</button>',
      onMount: function (root) {
        function add(sel, html) {
          var box = root.querySelector(sel), d = document.createElement('div');
          d.innerHTML = html; box.appendChild(d.firstChild);
        }
        root.querySelector('#fm_addc').onclick = function () { add('#fm_campos', miniRow('', CAMPOS, '')); };
        root.querySelector('#fm_addk').onclick = function () { add('#fm_cols', miniRow('', COLUMNAS, '')); };
        root.querySelector('#fm_addf').onclick = function () { add('#fm_firmas', miniRow('', null, null)); };
        root.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-rm]'); if (b) b.closest('.mini-row').remove();
        });
        function leer(sel) {
          return Array.prototype.map.call(root.querySelectorAll(sel + ' .mini-row'), function (row) {
            var k = row.querySelector('.fm-key');
            return { label: row.querySelector('.fm-lab').value.trim(), key: k ? k.value : '' };
          }).filter(function (x) { return x.label; });
        }
        root.querySelector('#fm_save').onclick = function () {
          var cols = leer('#fm_cols');
          if (!cols.length) { UI.note('El formato necesita al menos una columna.'); return; }
          var upd = Object.assign({}, f, {
            nombre: root.querySelector('#fm_nom').value.trim() || 'Formato',
            modulo: root.querySelector('#fm_mod').value,
            titulo: root.querySelector('#fm_tit').value.trim() || 'Formato',
            codigo: root.querySelector('#fm_cod').value.trim(),
            version: root.querySelector('#fm_ver').value.trim(),
            campos: leer('#fm_campos'), columnas: cols,
            firmas: leer('#fm_firmas').map(function (x) { return x.label; }),
            minFilas: Math.max(0, Math.min(60, +root.querySelector('#fm_min').value || 0))
          });
          var btn = root.querySelector('#fm_save'); btn.disabled = true;
          Promise.resolve(onOk(upd))
            .then(function () { m.close(); UI.note('Formato guardado'); })
            .catch(function (err) { btn.disabled = false; UI.note('No se pudo guardar: ' + (err && err.message || err)); });
        };
      }
    });
    return m;
  }

  /* ------------------------------ Panel: formatos de la droguería ------------------------------ */
  function manage(drogueria, modulo, onSave) {
    var dg = drogueria;

    function bodyHtml() {
      var list = (dg.formatos || []).filter(function (x) { return x.modulo === modulo; });
      return '<p class="dialog-note">Cargá el formato en blanco que usa ' + esc(dg.nombre) + ' (XLSX, DOCX o PDF). ' +
        'BPA-Plus lee su título, sus campos y sus columnas; desde entonces las actas de ' + esc(MODULOS[modulo].toLowerCase()) +
        ' se imprimen con ese formato ya llenado.</p>' +
        (list.length ? list.map(function (x, i) {
          return '<div class="row"><div class="row-top"><div class="chan cap"></div><div class="row-main">' +
            '<div class="row-name">' + esc(x.nombre || x.titulo) + '</div>' +
            '<div class="row-meta"><span>' + (x.campos || []).length + ' campos · ' + (x.columnas || []).length + ' columnas' +
              (x.codigo ? ' · ' + esc(x.codigo) : '') + '</span></div></div>' +
            (i === 0 ? UI.tag('realizada', 'En uso') : '') + '</div>' +
            '<div class="row-foot">' +
              (i === 0 ? '' : '<button class="link-btn" data-usar="' + esc(x.id) + '">' + icon('check', 14) + ' Usar este</button>') +
              '<button class="link-btn" data-cfg="' + esc(x.id) + '">' + icon('edit', 14) + ' Configurar</button>' +
              (x.archivo ? '<button class="link-btn" data-baj="' + esc(x.id) + '">' + icon('download', 14) + ' Original</button>' : '') +
              '<button class="link-btn" data-quitar="' + esc(x.id) + '">' + icon('trash', 14) + ' Quitar</button>' +
            '</div></div>';
        }).join('') : '<div class="row-empty">Sin formato propio: se imprime el acta genérica de BPA-Plus.</div>');
    }

    function persist(listaNueva) {
      var next = Object.assign({}, dg, { formatos: listaNueva });
      return Promise.resolve(onSave(next)).then(function () {
        dg = next;
        p.root.querySelector('.panel-body').innerHTML = bodyHtml();
      });
    }
    function alFrente(x, resto) { return [x].concat(resto); }

    var p = UI.panel({
      title: 'Formatos · ' + MODULOS[modulo],
      body: bodyHtml(),
      footer: '<label class="btn btn-primary" style="cursor:pointer">' + icon('upload', 16) + 'Cargar formato' +
        '<input type="file" id="fm_file" accept=".xlsx,.docx,.pdf" hidden></label>',
      onMount: function (root) {
        root.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-usar],[data-cfg],[data-quitar],[data-baj]'); if (!b) return;
          var id = b.dataset.usar || b.dataset.cfg || b.dataset.quitar || b.dataset.baj;
          var todos = (dg.formatos || []).slice();
          var x = todos.filter(function (y) { return y.id === id; })[0]; if (!x) return;
          var resto = todos.filter(function (y) { return y !== x; });
          if (b.dataset.usar) return persist(alFrente(x, resto));
          if (b.dataset.quitar) return persist(resto);
          if (b.dataset.baj) return global.BPAPLUS.drive.downloadStored(x.archivo).catch(function (e) { UI.note(e.message || e); });
          form(x, function (upd) { return persist(alFrente(upd, resto)); });
        });

        root.querySelector('#fm_file').onchange = function (ev) {
          var file = ev.target.files[0]; if (!file) return;
          ev.target.value = '';
          if (file.size >= 25 * 1024 * 1024) { UI.note('El formato debe pesar menos de 25 MB.'); return; }
          UI.note('Leyendo el formato…');
          global.BPAPLUS.drive.leerFormato(file).then(function (read) {
            form(parse(read, file.name, modulo), function (upd) {
              var Cloud = global.BPAPLUS.cloud;
              var subida = Cloud
                ? Cloud.uploadFile('droguerias/' + dg.id + '/formatos/' + upd.id + '/' + Date.now() + '_' + file.name, file, file.name)
                    .then(function (meta) { upd.archivo = meta; })
                    .catch(function () { UI.note('La configuración se guardó; el archivo original no se pudo subir.'); })
                : Promise.resolve();
              return subida.then(function () { return persist(alFrente(upd, (dg.formatos || []).slice())); });
            });
          }).catch(function (err) { UI.note('No se pudo leer el formato: ' + (err && err.message || err)); });
        };
      }
    });
    return p;
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.formatos = {
    MODULOS: MODULOS, parse: parse, render: render, para: para, form: form, manage: manage
  };
})(window);
