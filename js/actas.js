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

  /* ------------------------------ Acta de asistencia ------------------------------ */
  function actaAsistencia(dg, cap) {
    var caps = cap.capacitados || [];
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

    var noKeys = Object.keys(resp).filter(function (k) { return resp[k].v === 'no'; });
    function sevOf(key) {
      var parts = key.split('::'), sec = secciones.filter(function (s) { return s.seccion === parts[0]; })[0];
      var it = sec && sec.items[+parts[1]]; return it ? it.severidad : '';
    }
    var hCrit = noKeys.filter(function (k) { return sevOf(k) === 'critico'; }).length;
    var hMay = noKeys.filter(function (k) { return sevOf(k) === 'mayor'; }).length;
    var hMen = noKeys.filter(function (k) { return sevOf(k) === 'menor'; }).length;
    var siCount = Object.keys(resp).filter(function (k) { return resp[k].v === 'si'; }).length;
    var evaluados = siCount + noKeys.length;
    var pct = evaluados ? Math.round((siCount / evaluados) * 100) : 0;

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
  global.BPAPLUS.actas = { actaAsistencia: actaAsistencia, actaInspeccion: actaInspeccion };
})(window);
