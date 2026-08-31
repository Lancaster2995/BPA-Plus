/* ==========================================================================
   BPA-Plus — actas.js
   Generación de actas imprimibles (asistencia de capacitación y
   autoinspección) usando window.print(). 100% local — se imprime o se
   guarda como PDF desde el diálogo del navegador.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, UI = global.BPAPLUS.ui, esc = UI.esc;

  function membrete(dg) {
    return '<div class="acta-membrete">' +
      '<div class="acta-mark">V</div>' +
      '<div class="acta-org"><div class="emp">' + esc(dg.nombre || '') + '</div>' +
      (dg.ruc ? '<div class="ruc">RUC ' + esc(dg.ruc) + '</div>' : '') +
      (dg.direccion ? '<div class="ruc">' + esc(dg.direccion) + '</div>' : '') + '</div></div>';
  }

  function print(html) {
    var area = document.getElementById('printArea');
    area.innerHTML = html;
    requestAnimationFrame(function () { setTimeout(function () { global.print(); }, 40); });
  }

  /* ------------------------------ Ítems del checklist (pantalla) ------------------------------
     Un solo renderizador para el asistente de la app y para el sub-programa
     `autoinspecciones/`: si la clave `seccion::índice` se generara en dos sitios,
     un acta llenada afuera no encajaría al cargarla acá. */
  function itemsHtml(sec, respuestas) {
    respuestas = respuestas || {};
    return sec.items.map(function (it, idx) {
      var key = sec.seccion + '::' + idx, r = respuestas[key] || {}, cur = r.v, obs = r.obs || '';
      var sevBadge = it.severidad ? '<span class="chk-sev ' + it.severidad + '">' + esc(D.SEV_LABEL[it.severidad] || it.severidad) + '</span>' : '';
      return '<div class="chk-item"><div class="chk-text">' + (it.ref ? '<b>' + esc(it.ref) + ')</b> ' : '') + esc(it.texto) + sevBadge + '</div>' +
        '<div class="chk-row"><div class="chk-opts" data-key="' + esc(key) + '">' +
        ['si', 'no'].map(function (v) { return '<button type="button" class="chk-opt ' + (cur === v ? 'sel ' + v : '') + '" data-v="' + v + '">' + (v === 'si' ? 'Sí' : 'No') + '</button>'; }).join('') +
        '</div>' + (cur === 'no' ? '<input class="inp chk-obs" data-obskey="' + esc(key) + '" placeholder="Observación…" aria-label="Observación del ítem" value="' + esc(obs) + '">' : '') + '</div></div>';
    }).join('');
  }

  /* Si la droguería cargó su propio formato para el módulo, ese manda; el acta
     genérica de abajo queda como respaldo para quien no cargó ninguno. */
  function conFormato(dg, modulo, valores, filas) {
    var F = global.BPAPLUS.formatos, fmt = F && F.para(dg, modulo);
    if (!fmt) return false;
    print('<div class="acta">' + membrete(dg) + F.render(fmt, valores, filas) + '</div>');
    return true;
  }

  /* ------------------------------ Acta de asistencia ------------------------------ */
  function actaAsistencia(dg, cap) {
    var caps = cap.capacitados || [];
    var propio = conFormato(dg, 'capacitaciones', {
      tema: cap.tema || '', fecha: D.fLarga(cap.fecha), area: cap.area || '', frec: cap.frec || '',
      expositor: dg.dt || '', empresa: dg.nombre || '', ruc: dg.ruc || '', direccion: dg.direccion || ''
    }, caps.map(function (p) {
      return { nombre: p.nombre || '', cargo: p.cargo || '', dni: p.dni || '', areaP: p.area || cap.area || '' };
    }));
    if (propio) return;

    var filas = caps.length
      ? caps.map(function (p, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.nombre || '') + '</td><td>' + esc(p.cargo || '') + '</td><td></td></tr>'; }).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#888;padding:16px">Sin participantes registrados</td></tr>';

    var html = '<div class="acta">' + membrete(dg) +
      '<h1>Acta de asistencia a capacitación</h1>' +
      '<div class="acta-meta">' +
        '<div><b>Tema:</b> ' + esc(cap.tema || '') + '</div>' +
        '<div><b>Fecha:</b> ' + esc(D.fLarga(cap.fecha)) + '</div>' +
        '<div><b>Área:</b> ' + esc(cap.area || '') + '</div>' +
        '<div><b>Frecuencia:</b> ' + esc(cap.frec || '') + '</div>' +
      '</div>' +
      '<table><thead><tr><th style="width:36px">N.°</th><th>Nombres y apellidos</th><th style="width:34%">Cargo</th><th style="width:22%">Firma</th></tr></thead>' +
        '<tbody>' + filas + '</tbody></table>' +
      '<div class="acta-firmas">' +
        '<div class="firma-line">Expositor / capacitador</div>' +
        '<div class="firma-line">Director técnico — ' + esc(dg.dt || '') + '</div>' +
      '</div></div>';
    print(html);
  }

  /* ------------------------------ Evaluación de capacitación ------------------------------ */
  /* Sale en blanco a propósito: es la hoja que llena el participante. La clave
     de respuestas queda en la app, no en el papel que se reparte. */
  function actaEvaluacion(dg, cap) {
    var ev = cap.evaluacion || { preguntas: [] };
    var LETRAS = ['A', 'B', 'C', 'D'];
    var cuerpo = ev.preguntas.map(function (p, i) {
      return '<div class="eval-q"><div class="eval-enun">' + (i + 1) + '. ' + esc(p.enunciado) + '</div>' +
        '<div class="eval-ops">' + (p.opciones || []).map(function (o, j) {
          return '<div class="eval-op"><span class="eval-box"></span><b>' + LETRAS[j] + ')</b> ' + esc(o) + '</div>';
        }).join('') + '</div></div>';
    }).join('');

    var html = '<div class="acta">' + membrete(dg) +
      '<h1>Evaluación de capacitación</h1>' +
      '<div class="acta-meta">' +
        '<div><b>Tema:</b> ' + esc(cap.tema || '') + '</div>' +
        '<div><b>Fecha:</b> ' + esc(D.fLarga(cap.fecha)) + '</div>' +
        '<div><b>Área:</b> ' + esc(cap.area || '') + '</div>' +
        '<div><b>Nota mínima aprobatoria:</b> 4 de 5</div>' +
      '</div>' +
      '<table class="eval-head"><tbody><tr><td><b>Participante:</b></td><td></td><td><b>Cargo:</b></td><td></td></tr></tbody></table>' +
      (cuerpo || '<p style="color:#888">Esta capacitación todavía no tiene evaluación generada.</p>') +
      '<div class="acta-firmas">' +
        '<div class="firma-line">Firma del participante</div>' +
        '<div class="firma-line">Evaluado por — ' + esc(dg.dt || '') + '</div>' +
      '</div></div>';
    print(html);
  }

  /* Una fila por ítem respondido, para el formato propio de la droguería. */
  function filasInspeccion(secciones, resp, SEV) {
    var out = [];
    secciones.forEach(function (sec) {
      sec.items.forEach(function (it, idx) {
        var r = resp[sec.seccion + '::' + idx];
        if (!r || !r.v) return;
        out.push({
          seccion: sec.seccion, texto: (it.ref ? it.ref + ') ' : '') + it.texto,
          si: r.v === 'si' ? 'X' : '', no: r.v === 'no' ? 'X' : '',
          severidad: SEV[it.severidad] || '', obs: r.obs || ''
        });
      });
    });
    return out;
  }

  /* ------------------------------ Acta de autoinspección (REGISTRO_004) ------------------------------ */
  function actaInspeccion(dg, acta) {
    var resp = acta.respuestas || {};
    var secciones = (acta.checklist || D.checklistOficial());
    var SEV = D.SEV_LABEL || {};

    var cuerpo = secciones.map(function (sec) {
      var filas = sec.items.map(function (it, idx) {
        var key = sec.seccion + '::' + idx;
        var v = resp[key] && resp[key].v;
        var obs = (resp[key] && resp[key].obs) || '';
        var si = v === 'si' ? '✓' : '', no = v === 'no' ? '✓' : '';
        var noCls = v === 'no' ? ' class="no-conforme"' : '';
        return '<tr><td>' + (it.ref ? '<b>' + esc(it.ref) + ')</b> ' : '') + esc(it.texto) + '</td>' +
          '<td style="width:34px;text-align:center">' + si + '</td><td style="width:34px;text-align:center">' + no + '</td>' +
          '<td style="width:64px;text-align:center;font-size:10px">' + esc(SEV[it.severidad] || '') + '</td>' +
          '<td' + noCls + ' style="width:22%">' + esc(obs) + '</td></tr>';
      }).join('');
      return '<tr><th colspan="5" class="acta-sec">' + esc(sec.seccion) + '</th></tr>' + filas;
    }).join('');

    var h = D.hallazgos({ checklist: secciones, respuestas: resp });
    var hCrit = h.critico, hMay = h.mayor, hMen = h.menor, pct = h.pct;

    var propio = conFormato(dg, 'inspecciones', {
      tema: 'Autoinspección al almacén', fecha: D.fLarga(acta.fecha),
      area: acta.almacen || dg.nombre || '', empresa: dg.nombre || '', ruc: acta.ruc || dg.ruc || '',
      direccion: dg.direccion || '', auditor: acta.auditor || '', numActa: acta.numActa || '',
      expositor: dg.dt || '', cumplimiento: pct + '%', hallazgos: hCrit + ' / ' + hMay + ' / ' + hMen
    }, filasInspeccion(secciones, resp, SEV));
    if (propio) return;

    var datos = [
      ['N.° de acta', acta.numActa], ['Fecha', D.fLarga(acta.fecha)],
      ['Almacén inspeccionado', acta.almacen || dg.nombre], ['R.U.C.', acta.ruc || dg.ruc],
      ['R.D. autorización sanitaria', acta.rdAutorizacion], ['Auditor', acta.auditor],
      ['Planos de distribución', acta.planos], ['Relación de clientes y proveedores', acta.clientesProveedores],
      ['Relación de productos que comercializa', acta.productos], ['POE verificados', acta.poeVerificados]
    ].filter(function (r) { return r[1]; });

    var html = '<div class="acta">' + membrete(dg) +
      '<h1>Acta de inspección al almacén</h1>' +
      '<div class="acta-meta">' + datos.map(function (r) { return '<div><b>' + esc(r[0]) + ':</b> ' + esc(r[1]) + '</div>'; }).join('') + '</div>' +
      (acta.resultadosPrevios ? '<p style="margin:10px 0"><b>Resultados de inspecciones anteriores:</b> ' + esc(acta.resultadosPrevios) + '</p>' : '') +
      '<table><thead><tr><th>Asunto</th><th style="width:34px">Sí</th><th style="width:34px">No</th><th style="width:64px">Severidad</th><th style="width:22%">Observación</th></tr></thead><tbody>' + cuerpo + '</tbody></table>' +
      '<table style="margin-top:14px"><tbody>' +
        '<tr><th style="width:40%">Hallazgos críticos</th><td>' + hCrit + '</td></tr>' +
        '<tr><th>Hallazgos mayores</th><td>' + hMay + '</td></tr>' +
        '<tr><th>Hallazgos menores</th><td>' + hMen + '</td></tr>' +
        '<tr><th>% de cumplimiento (Sí / evaluados)</th><td><b>' + pct + '%</b></td></tr>' +
      '</tbody></table>' +
      (acta.observAdicionales ? '<p style="margin-top:14px"><b>Observaciones adicionales:</b> ' + esc(acta.observAdicionales) + '</p>' : '') +
      (acta.conclusiones ? '<p style="margin-top:8px"><b>Evaluación y conclusiones:</b> ' + esc(acta.conclusiones) + '</p>' : '') +
      (acta.medidas ? '<p style="margin-top:8px"><b>Propuestas de medidas correctivas:</b> ' + esc(acta.medidas) + '</p>' : '') +
      '<div class="acta-firmas">' +
        '<div class="firma-line">Auditor — ' + esc(acta.auditor || '') + '</div>' +
        '<div class="firma-line">Establecimiento — ' + esc(dg.dt || '') + '</div>' +
      '</div></div>';
    print(html);
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.actas = { actaAsistencia: actaAsistencia, actaEvaluacion: actaEvaluacion, actaInspeccion: actaInspeccion, itemsHtml: itemsHtml };
})(window);
