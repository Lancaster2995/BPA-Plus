/* ==========================================================================
   BPA-Plus — autoinspecciones/main.js
   Sub-programa independiente. Carga el formato predeterminado del acta de
   inspección de una droguería (el .json que exporta BPA-Plus), deja llenarlo
   sin cuenta, sin nube y sin PIN, y lo devuelve en el mismo formato para
   cargarlo después en el módulo de Autoinspecciones de esa droguería.
   ========================================================================== */
(function (global) {
  'use strict';
  var B = global.BPAPLUS, D = B.domain, UI = B.ui, A = B.actas, esc = UI.esc, icon = UI.icon;
  var KEY = 'bpa-autoinspecciones-borrador-v1';
  var el = document.getElementById('content');
  var dg = null, acta = null; // droguería del formato + acta que se está llenando

  /* ------------------------------ Borrador local ------------------------------
     El sub-programa no tiene base de datos: lo que se está llenando vive en
     localStorage hasta que se descarga el archivo. */
  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(D.formatoActa(dg, acta))); } catch (e) {} }
  function borrador() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }

  function abrir(sobre) {
    var pack;
    try { pack = D.leerActa(sobre); } catch (err) { UI.note(err.message || 'Archivo inválido'); return; }
    dg = pack.drogueria; acta = pack.acta;
    guardar(); render();
  }

  /* ------------------------------ Pantalla inicial ------------------------------ */
  function landingHtml() {
    var b = borrador(), pend = '';
    if (b && b.acta) {
      var h = D.hallazgos(b.acta);
      pend = '<div class="section-title">Borrador en este dispositivo</div>' +
        '<div class="subprog"><div class="subprog-txt"><b>' + esc((b.drogueria && b.drogueria.nombre) || 'Sin droguería') + '</b> · acta N.° ' +
          esc(b.acta.numActa || '—') + ' · ' + h.evaluados + ' de ' + h.total + ' ítems evaluados</div>' +
        '<button class="btn btn-primary" data-a="seguir">Continuar</button>' +
        '<button class="btn btn-danger" data-a="tirar">Descartar</button></div>';
    }
    return '<div class="view-header"><div><div class="view-title">Autoinspecciones</div>' +
      '<div class="view-sub">Sub-programa · acta de inspección al almacén (REGISTRO_004)</div></div></div>' + pend +
      '<div class="section-title">Empezar</div>' +
      '<div class="subprog"><div class="subprog-txt">Cargá el <b>formato</b> que descargaste desde BPA-Plus (Autoinspecciones → Sub-programa → Formato). Trae los datos de la droguería y su checklist. También sirve para retomar un acta ya descargada.</div>' +
        '<button class="btn btn-primary" data-a="cargar">' + icon('upload', 16) + 'Cargar formato o acta</button></div>' +
      '<div class="subprog" style="margin-top:8px"><div class="subprog-txt">¿No tenés el archivo a mano? Empezá con el formato oficial en blanco y escribí los datos del almacén a mano.</div>' +
        '<button class="btn btn-ghost" data-a="blanco">Formato oficial en blanco</button></div>' +
      '<p class="dialog-note" style="margin-top:20px">Todo pasa en este dispositivo: no hay cuenta, ni servidor, ni conexión. Al terminar se descarga el mismo formato ya llenado, y ese archivo se carga en el módulo de Autoinspecciones de la droguería.</p>';
  }

  /* ------------------------------ Acta ------------------------------ */
  var CAMPOS = [
    ['numActa', 'Acta N.°', 'mono'], ['fecha', 'Fecha', 'date'], ['auditor', 'Auditor'],
    ['almacen', 'Almacén inspeccionado'], ['ruc', 'R.U.C.', 'mono'], ['rdAutorizacion', 'R.D. autorización sanitaria'],
    ['planos', 'Planos de distribución de las áreas del almacén'],
    ['clientesProveedores', 'Relación de clientes y proveedores'],
    ['productos', 'Relación de productos que comercializa'],
    ['poeVerificados', 'Lista de procedimientos operativos estándar verificados']
  ];
  var CIERRE = [
    ['observAdicionales', 'Observaciones adicionales'],
    ['conclusiones', 'Evaluación y conclusiones'],
    ['medidas', 'Propuestas de medidas correctivas']
  ];

  function campoHtml(c) {
    return '<div class="field"><label>' + esc(c[1]) + '</label><input class="inp' + (c[2] === 'mono' ? ' mono' : '') + '"' +
      (c[2] === 'date' ? ' type="date"' : '') + ' data-f="' + c[0] + '" value="' + esc(acta[c[0]] || '') + '"></div>';
  }
  function areaHtml(c) {
    return '<div class="field"><label>' + esc(c[1]) + '</label><textarea class="inp" data-f="' + c[0] + '">' + esc(acta[c[0]] || '') + '</textarea></div>';
  }

  function hechos(sec) {
    return sec.items.filter(function (it, i) { return acta.respuestas[sec.seccion + '::' + i]; }).length;
  }
  function seccionHtml(sec, i) {
    var d = hechos(sec), t = sec.items.length;
    return '<details class="sec-card" data-sec="' + i + '"><summary><span class="sec-name">' + esc(sec.seccion) + '</span>' +
      '<span class="sec-count ' + (d === t ? 'done' : d ? 'partial' : '') + '">' + d + ' / ' + t + '</span></summary>' +
      '<div class="sec-items">' + A.itemsHtml(sec, acta.respuestas) + '</div></details>';
  }

  function resumenTxt(h) {
    return h.evaluados + ' de ' + h.total + ' ítems · ' + h.critico + ' crítico(s), ' + h.mayor + ' mayor(es), ' + h.menor + ' menor(es)' +
      (h.completada ? ' · acta completa' : '');
  }

  function actaHtml() {
    var h = D.hallazgos(acta);
    return '<div class="view-header"><div><div class="view-title">Acta de inspección</div>' +
      '<div class="view-sub">' + esc(dg.nombre || 'Sin droguería') + (dg.ruc ? ' · RUC ' + esc(dg.ruc) : '') + '</div></div>' +
      '<div class="header-actions"><button class="btn btn-ghost" data-a="salir">Cambiar formato</button></div></div>' +
      '<div class="progress" style="margin-bottom:18px"><div class="progress-top"><span>Ítems evaluados</span>' +
        '<strong id="prog_n">' + h.evaluados + ' / ' + h.total + '</strong></div>' +
        '<div class="progress-track"><div class="progress-fill" id="prog_bar" style="width:' + (h.total ? Math.round(h.evaluados / h.total * 100) : 0) + '%"></div></div></div>' +
      '<div class="section-title">Datos generales</div>' +
      CAMPOS.map(campoHtml).join('') + areaHtml(['resultadosPrevios', 'Resultados de inspecciones anteriores']) +
      '<div class="section-title">Checklist</div><div id="secs">' + acta.checklist.map(seccionHtml).join('') + '</div>' +
      '<div class="section-title">Cierre</div>' + CIERRE.map(areaHtml).join('') +
      '<div class="subprog sticky-acta"><div class="subprog-txt" id="resumen">' + esc(resumenTxt(h)) + '</div>' +
        '<button class="btn btn-ghost" data-a="imprimir">' + icon('print', 16) + 'Imprimir / PDF</button>' +
        '<button class="btn btn-primary" data-a="descargar">' + icon('download', 16) + 'Descargar acta llenada</button></div>';
  }

  function render() {
    el.innerHTML = acta ? actaHtml() : landingHtml();
    global.scrollTo(0, 0);
  }

  function refrescarProgreso() {
    var h = D.hallazgos(acta);
    var n = document.getElementById('prog_n'), bar = document.getElementById('prog_bar'), r = document.getElementById('resumen');
    if (n) n.textContent = h.evaluados + ' / ' + h.total;
    if (bar) bar.style.width = (h.total ? Math.round(h.evaluados / h.total * 100) : 0) + '%';
    if (r) r.textContent = resumenTxt(h);
  }

  function refrescarSeccion(card) {
    var sec = acta.checklist[+card.dataset.sec], d = hechos(sec), t = sec.items.length;
    card.querySelector('.sec-items').innerHTML = A.itemsHtml(sec, acta.respuestas);
    var c = card.querySelector('.sec-count');
    c.textContent = d + ' / ' + t;
    c.className = 'sec-count ' + (d === t ? 'done' : d ? 'partial' : '');
  }

  /* ------------------------------ Acciones ------------------------------ */
  function nombreArchivo() {
    return ('acta-' + (acta.numActa || 'sin-numero') + '-' + (dg.ruc || dg.nombre || 'drogueria') + '.json')
      .replace(/[^\w.-]+/g, '-').toLowerCase();
  }

  var ACCIONES = {
    cargar: function () { UI.pickJSON(abrir); },
    blanco: function () { abrir(D.formatoActa(null, null)); },
    seguir: function () { abrir(borrador()); },
    tirar: function () {
      UI.confirm({ title: 'Descartar borrador', message: 'Se borra lo llenado en este dispositivo. No se puede deshacer.', okLabel: 'Descartar', danger: true })
        .then(function (ok) { if (!ok) return; try { localStorage.removeItem(KEY); } catch (e) {} render(); UI.note('Borrador descartado'); });
    },
    salir: function () { acta = null; dg = null; render(); },
    imprimir: function () { D.aplicarHallazgos(acta); guardar(); A.actaInspeccion(dg, acta); },
    descargar: function () {
      var h = D.aplicarHallazgos(acta);
      guardar();
      UI.download(nombreArchivo(), D.formatoActa(dg, acta));
      UI.note('Acta descargada — ' + h.evaluados + ' de ' + h.total + ' ítems. Cargala en BPA-Plus.');
    }
  };

  /* Un solo par de escuchas delegadas: el contenido se repinta entero y siguen valiendo. */
  el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]');
    if (b) { var f = ACCIONES[b.dataset.a]; if (f) f(); return; }
    var opt = e.target.closest('.chk-opt');
    if (!opt || !acta) return;
    var key = opt.closest('[data-key]').dataset.key, v = opt.dataset.v;
    if ((acta.respuestas[key] || {}).v === v) delete acta.respuestas[key];
    else acta.respuestas[key] = Object.assign(acta.respuestas[key] || {}, { v: v });
    guardar();
    refrescarSeccion(opt.closest('.sec-card'));
    refrescarProgreso();
  });

  el.addEventListener('input', function (e) {
    var t = e.target;
    if (!acta) return;
    if (t.classList.contains('chk-obs')) {
      var k = t.dataset.obskey;
      if (acta.respuestas[k]) { acta.respuestas[k].obs = t.value; guardar(); }
      return;
    }
    if (t.dataset && t.dataset.f) { acta[t.dataset.f] = t.value; guardar(); }
  });

  /* ------------------------------ Arranque ------------------------------ */
  try { if (localStorage.getItem('bpa-plus-theme-v2') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}
  render();

  global.BPAPLUS.autoinspecciones = { abrir: abrir, actual: function () { return acta ? D.formatoActa(dg, acta) : null; } };
})(window);
