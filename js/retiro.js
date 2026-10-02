/* ==========================================================================
   BPA-Plus — retiro.js
   Simulacro de retiro de mercado: un solo registro genera los diez documentos
   del expediente (carta del fabricante, inmovilización y respuesta por
   destinatario, órdenes de retiro, conciliación, comunicación a DIGEMID y
   revisión de la eficacia). Se imprimen con el mismo `printArea` que las
   actas — nada sale del navegador.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, UI = global.BPAPLUS.ui, esc = UI.esc, icon = UI.icon, tag = UI.tag;

  function A() { return global.BPAPLUS.actas; }
  function store() { return global.BPAPLUS.store; }

  var TIPO_LABEL = { almacen: 'Almacén', cliente: 'Cliente' };

  /* ------------------------------ Derivados ------------------------------
     La numeración de cartas y órdenes sale de la posición del destinatario, y
     la cantidad consumida de entregada − stock: un solo lugar cada una, así la
     orden de retiro y la conciliación no pueden contradecirse (en los formatos
     llenados a mano sí se contradicen). */
  function dests(r) { return r.dests || []; }
  function anio(r) { return String(r.cartaFabFecha || D.isoHoy()).slice(0, 4); }
  function nroDoc(r, i) { return ('00' + (i + 1)).slice(-3) + '-' + anio(r); }
  function num(v) { return +v || 0; }
  function consumida(d) { return Math.max(0, num(d.entregada) - num(d.stock)); }
  function recuperado(r) { return dests(r).reduce(function (a, d) { return a + num(d.stock); }, 0); }
  function distribuida(r) {
    return r.distribuida != null && r.distribuida !== ''
      ? num(r.distribuida)
      : dests(r).reduce(function (a, d) { return Math.max(a, num(d.entregada)); }, 0);
  }
  function enAlmacen(r) {
    return dests(r).reduce(function (a, d) { return a + (d.tipo === 'almacen' ? num(d.stock) : 0); }, 0);
  }
  function money(v) { return num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function sim(r) { return r.simulacro !== false; }

  /* Un documento de simulacro que no diga que lo es puede terminar en DIGEMID
     como si fuera un retiro real. Va en el título de los diez. */
  function titulo(t, r) { return esc(t) + (sim(r) ? ' <span class="acta-sim">SIMULACRO</span>' : ''); }

  /* ------------------------------ Documentos ------------------------------ */
  /* Cada documento es una hoja: membrete arriba, pie de página abajo del todo. */
  function hoja(dg, cuerpo) {
    return '<div class="acta hoja-pie">' + A().membrete(dg) + '<div>' + cuerpo + '</div>' + pie(dg) + '</div>';
  }
  function lema(r) { return r.lema ? '<div class="carta-lema">“' + esc(r.lema) + '”</div>' : ''; }
  function p(txt) { return '<p class="carta-p">' + txt + '</p>'; }
  function fechaLinea(iso, ciudad) {
    return '<div class="carta-fecha">' + (ciudad === null ? '' : esc(ciudad || 'Lima') + ', ') +
      esc(D.fLarga(iso || D.isoHoy())) + '</div>';
  }
  function dosDigitos(n) { return ('0' + num(n)).slice(-2); }

  function firmaCol(nombre, cargo) {
    return '<div class="firma-line">' + esc(nombre || '') +
      (cargo ? '<br><small>' + esc(cargo) + '</small>' : '') + '</div>';
  }
  /* Las cartas llevan una sola firma y va abajo a la izquierda, en una línea. Los
     registros (009, 010, 011) siguen con sus columnas de firmas. */
  /* El sello del Director Técnico reemplaza la línea de firma donde antes decía
     «Director Técnico»: es lo que se estampa en el papel. Sale de la droguería. */
  function razonCorta(nombre) {
    return String(nombre || '').replace(/\s*(S\.?A\.?C\.?|S\.?A\.?|E\.?I\.?R\.?L\.?|S\.?R\.?L\.?)\s*$/i, '').trim();
  }
  function selloDT(dg) {
    return '<div class="sello">' +
      '<div class="sello-emp">' + esc(razonCorta(dg.nombre)) + '</div>' +
      '<div class="sello-linea"></div>' +
      '<div class="sello-nom">' + esc(dg.dt || '') + '</div>' +
      '<div class="sello-cargo">' + esc(dg.dtCargo || 'D.T QUIMICO FARMACEUTICO') + '</div>' +
      (dg.dtColegiatura ? '<div class="sello-col">' + esc(dg.dtColegiatura) + '</div>' : '') + '</div>';
  }
  function firmaSello(dg) { return '<div class="acta-firma-uno">' + selloDT(dg) + '</div>'; }

  var ICO = {
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>'
  };
  function pieItem(k, txt) {
    return txt ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + ICO[k] + '</svg>' + esc(txt) + '</span>' : '';
  }
  function pie(dg) {
    return '<div class="acta-pie">' + pieItem('pin', dg.direccion) + pieItem('tel', dg.telefono) +
      pieItem('mail', dg.email) + pieItem('web', dg.web) + '</div>';
  }

  function firma(nombre, cargo) {
    return '<div class="acta-firma-uno"><div class="firma-line">' + esc(nombre || '') +
      (cargo ? ' <small>· ' + esc(cargo) + '</small>' : '') + '</div></div>';
  }

  /* 1. Carta del fabricante — la que abre el expediente. */
  function cartaFabricante(dg, r) {
    return hoja(dg,
      '<h1>' + titulo('Carta del fabricante N° ' + (r.cartaFabNum || '—'), r) + '</h1>' +
      fechaLinea(r.cartaFabFecha, null) +
      '<div class="carta-dest"><b>Señores</b><br>' + esc(dg.nombre) + '<br>' + esc(dg.direccion || '') + '</div>' +
      p('<b>Asunto:</b> Inmovilización del producto ' + esc(r.producto) + ', lote ' + esc(r.lote) + '.') +
      p('Por medio de la presente hacemos de su conocimiento que el producto <b>' + esc(r.producto) +
        '</b> de lote <b>' + esc(r.lote) + '</b>, distribuido y comercializado por nuestra representada ' +
        esc(r.fabricante) + ' a la droguería ' + esc(dg.nombre) +
        (r.factura ? ' mediante la factura/invoice N° ' + esc(r.factura) : '') +
        (r.facturaFecha ? ' de fecha ' + esc(D.fLocal(r.facturaFecha)) : '') +
        ', ha presentado ' + esc(r.motivo) + ', por lo que solicitamos su inmovilización a la brevedad.') +
      p('A la vez, solicitamos informar si su representada aún cuenta con stock del producto mencionado, a fin de ' +
        'realizar las acciones pertinentes para su retiro del mercado y el correspondiente canje o abono por el ' +
        'valor de las unidades existentes.') +
      firma(r.fabFirmante, (r.fabCargo || '') + (r.fabricante ? ' · ' + r.fabricante : '')));
  }

  /* 2 y 3. Carta de inmovilización, una por destinatario (almacén / cliente). */
  function inmovilizacion(dg, r, d, i) {
    return hoja(dg, lema(r) +
      '<h1>' + titulo('Carta de inmovilización N° ' + nroDoc(r, i), r) + '</h1>' +
      fechaLinea(d.fechaCarta) +
      '<div class="carta-dest"><b>Señores</b><br>' + esc(d.nombre) + '<br>' + esc(d.direccion || '') +
        (d.ruc ? '<br>RUC ' + esc(d.ruc) : '') + '</div>' +
      p('<b>Asunto:</b> ' + (sim(r) ? 'SIMULACRO DE RETIRO DE PRODUCTO — ' : '') + 'inmovilización del producto ' +
        esc(r.producto) + ', lote ' + esc(r.lote) + '.') +
      p('<b>Referencia:</b> carta del fabricante N° ' + esc(r.cartaFabNum || '—') +
        (r.cartaFabFecha ? ' de fecha ' + esc(D.fLocal(r.cartaFabFecha)) : '') + '.') +
      p('De nuestra consideración: por disposición del fabricante ' + esc(r.fabricante) +
        ', comunicada mediante el documento de la referencia, el producto <b>' + esc(r.producto) +
        '</b> de lote <b>' + esc(r.lote) + '</b>' + (r.rs ? ' (registro sanitario ' + esc(r.rs) + ')' : '') +
        ' ha presentado ' + esc(r.motivo) + '. En cumplimiento de nuestro procedimiento de retiro del mercado, ' +
        'solicitamos a ustedes:') +
      '<ol class="carta-lista">' +
        '<li>Inmovilizar de inmediato la totalidad de las unidades del producto y lote indicados, identificándolas y ' +
          'separándolas físicamente en el área de devoluciones, impidiendo su comercialización, distribución o uso.</li>' +
        '<li>Informar por escrito, dentro de las 24 horas de recibida la presente, la cantidad en stock a la fecha.</li>' +
        '<li>Mantener la inmovilización hasta recibir la orden de retiro correspondiente.</li>' +
      '</ol>' +
      firmaSello(dg));
  }

  /* 4 y 5. Respuesta del destinatario, con el stock declarado. */
  function respuesta(dg, r, d, i) {
    var n = num(d.stock);
    return hoja(dg, lema(r) +
      '<h1>' + titulo('Respuesta de ' + (TIPO_LABEL[d.tipo] || 'destinatario').toLowerCase() + ' — ' + d.nombre, r) + '</h1>' +
      fechaLinea(d.fechaResp) +
      '<div class="carta-dest"><b>Señores</b><br>' + esc(dg.nombre) + '<br>' + esc(dg.direccion || '') + '</div>' +
      p('<b>Asunto:</b> ' + (sim(r) ? 'SIMULACRO DE RETIRO DE PRODUCTO' : 'retiro de producto del mercado') + '.') +
      p('<b>Referencia:</b> carta de inmovilización N° ' + nroDoc(r, i) + '.') +
      p('Mediante la presente damos respuesta al documento de la referencia, relacionado con la disponibilidad del ' +
        'producto <b>' + esc(r.producto) + '</b> de lote <b>' + esc(r.lote) + '</b>. Manifestamos que a la fecha ' +
        esc(d.nombre) + (n ? ' <b>cuenta con stock</b>' : ' <b>no cuenta con stock</b>') +
        ' del producto en sus instalaciones; para lo cual detallamos:') +
      '<table class="carta-tabla"><tbody>' +
        '<tr><th style="width:45%">Stock a la fecha</th><td><b>' + dosDigitos(n) + '</b> unidad(es)</td></tr>' +
        (d.guia ? '<tr><th>Guía de remisión o factura</th><td>' + esc(d.guia) + '</td></tr>' : '') +
      '</tbody></table>' +
      firma(d.firmante, (d.cargo || '') + ' · ' + d.nombre));
  }

  /* 6 y 7. Registro 009 — Orden de retiro, una por destinatario. */
  function ordenRetiro(dg, r, d, i) {
    return hoja(dg,
      '<div class="reg-head"><span>Registro N° 009</span><span>Pág. 1 de 1</span></div>' +
      '<h1>' + titulo('Orden de retiro', r) + '</h1>' +
      '<div class="acta-meta"><div><b>N°:</b> ' + nroDoc(r, i) + '</div>' +
        '<div><b>Fecha:</b> ' + esc(D.fLocal(d.fechaResp || r.cartaFabFecha)) + '</div>' +
        '<div><b>Establecimiento:</b> ' + esc(d.nombre) + '</div>' +
        '<div><b>Dirección:</b> ' + esc(d.direccion || '—') + '</div></div>' +
      p('<b>Referencia:</b> respuesta a la carta de inmovilización N° ' + nroDoc(r, i) + '.') +
      '<table><thead><tr><th>Código</th><th>Descripción del producto</th><th>N° de lote</th>' +
        '<th>Guía de remisión o factura</th><th>N° de registro sanitario</th><th>Cantidad</th><th>Motivo</th></tr></thead>' +
      '<tbody><tr><td class="mono">' + esc(r.codigo || '—') + '</td><td>' + esc(r.producto) + '</td>' +
        '<td class="mono">' + esc(r.lote) + '</td><td>' + esc(d.guia || '—') + '</td>' +
        '<td class="mono">' + esc(r.rs || '—') + '</td><td>' + dosDigitos(d.stock) + '</td>' +
        '<td>' + esc(r.motivo) + '</td></tr></tbody></table>' +
      p('<b>Conclusiones:</b> se procede con el retiro de ' + num(d.stock) + ' unidad(es) del producto ' +
        esc(r.producto) + ' de lote ' + esc(r.lote) + ', debido a que presenta ' + esc(r.motivo) +
        ', reportado por el fabricante ' + esc(r.fabricante) + ' mediante la carta N° ' + esc(r.cartaFabNum || '—') + '.') +
      '<div class="acta-firmas"><div class="firma-line">Rep. del establecimiento que entrega</div>' +
        '<div class="firma-line">Representante o resp. de almacén</div>' +
        '<div class="firma-line firma-sello">' + selloDT(dg) + '<small>V°B° Director Técnico</small></div></div>');
  }

  /* 8. Registro 010 — Conciliación de productos retirados del mercado. */
  function conciliacion(dg, r) {
    var filas = dests(r).map(function (d, i) {
      return '<tr><td>' + esc(d.nombre) + (d.tipo === 'almacen' ? ' <small>(almacén)</small>' : '') + '</td>' +
        '<td>' + esc(d.guia || '—') + '</td><td>' + num(d.entregada) + '</td><td>' + consumida(d) + '</td>' +
        '<td>' + num(d.stock) + '</td><td class="mono">' + nroDoc(r, i) + '</td></tr>';
    }).join('');
    return hoja(dg,
      '<div class="reg-head"><span>Registro N° 010</span><span>Pág. 1 de 1</span></div>' +
      '<h1>' + titulo('Conciliación de productos retirados del mercado', r) + '</h1>' +
      '<div class="acta-meta"><div><b>Descripción:</b> ' + esc(r.producto) + '</div>' +
        '<div><b>Código:</b> ' + esc(r.codigo || '—') + '</div>' +
        '<div><b>Lote:</b> ' + esc(r.lote) + '</div>' +
        '<div><b>Registro sanitario:</b> ' + esc(r.rs || '—') + '</div>' +
        '<div><b>Fabricante:</b> ' + esc(r.fabricante) + '</div>' +
        '<div><b>Titular:</b> ' + esc(dg.nombre) + '</div></div>' +
      '<table><thead><tr><th>Establecimiento / cliente</th><th>Guía de remisión o factura</th>' +
        '<th>Cantidad entregada</th><th>Cantidad consumida</th><th>Cantidad recuperada</th>' +
        '<th>Orden de retiro N°</th></tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
      '<tfoot><tr><th colspan="2">Sub total recuperado de clientes</th><td colspan="4">' + (recuperado(r) - enAlmacen(r)) + '</td></tr>' +
        '<tr><th colspan="2">Stock inmovilizado en el almacén</th><td colspan="4">' + enAlmacen(r) + '</td></tr>' +
        '<tr><th colspan="2">Unidades distribuidas (importación)</th><td colspan="4">' + distribuida(r) + '</td></tr>' +
        '<tr><th colspan="2">Total recuperado</th><td colspan="4"><b>' + recuperado(r) + '</b></td></tr></tfoot></table>' +
      '<div class="acta-firmas">' + firmaCol(r.repLegal, 'Representante legal') +
        '<div class="firma-line firma-sello">' + selloDT(dg) + '</div></div>');
  }

  /* 9. Comunicación a DIGEMID de las medidas adoptadas. */
  function cartaDigemid(dg, r) {
    return hoja(dg,
      '<h1>' + titulo('Comunicación a DIGEMID de las medidas adoptadas', r) + '</h1>' +
      fechaLinea(r.digemidFecha) +
      '<div class="carta-dest"><b>Atención:</b> Dirección General de Control y Vigilancia Sanitaria<br>' +
        'Dirección General de Medicamentos, Insumos y Drogas — DIGEMID</div>' +
      p('<b>Asunto:</b> ' + (sim(r) ? 'SIMULACRO — ' : '') + 'medidas adoptadas para el retiro del mercado de un producto.') +
      p('<b>Referencia:</b> carta del fabricante N° ' + esc(r.cartaFabNum || '—') + '.') +
      p('La empresa ' + esc(dg.nombre) + (dg.ruc ? ', con RUC N° ' + esc(dg.ruc) : '') +
        ', debidamente representada por ' + esc(r.repLegal || '—') +
        ', comunica a ustedes las medidas adoptadas para el retiro del mercado del producto <b>' + esc(r.producto) +
        '</b> de lote <b>' + esc(r.lote) + '</b>, fabricado por ' + esc(r.fabricante) +
        '. Al tomar conocimiento de la no conformidad' +
        (r.cartaFabFecha ? ' en fecha ' + esc(D.fLocal(r.cartaFabFecha)) : '') +
        ' por parte del fabricante, se procedió al retiro del producto conforme a nuestro procedimiento y a la norma ' +
        'legal vigente, recuperándose <b>' + recuperado(r) + '</b> de ' + distribuida(r) +
        ' unidad(es) distribuida(s). Lo actuado se evidencia con la documentación adjunta:') +
      '<ol class="carta-lista"><li>Cartas de inmovilización y sus respuestas.</li>' +
        '<li>Órdenes de retiro (Registro N° 009).</li>' +
        '<li>Acta de conciliación de productos retirados (Registro N° 010).</li>' +
        '<li>Revisión de la eficacia del retiro (Registro N° 011).</li></ol>' +
      firma(r.repLegal, 'Representante legal · ' + dg.nombre));
  }

  /* 10. Registro 011 — Revisión de la eficacia del retiro. */
  function revisionEficacia(dg, r) {
    var filas = [
      ['Fecha de la primera solicitud del retiro', D.fLocal(r.fSolicitud)],
      ['Total de solicitudes de retiro / forma de comunicación', dests(r).length + ' · ' + (r.comunicacion || 'Carta')],
      ['Fecha de ingreso del primer producto retirado', D.fLocal(r.fIngreso)],
      ['Fecha de ingreso del último producto retirado', D.fLocal(r.fIngresoUlt)],
      ['Fecha de destrucción del producto', D.fLocal(r.fDestruccion)],
      ['Cantidad de producto vencido', String(num(r.vencidas))],
      ['Cantidad de producto retirado', String(recuperado(r))],
      ['Costo de comercialización', money(r.costoComercial)],
      ['Costo del proceso de retiro', money(r.costoProceso)]
    ].map(function (f) {
      return '<tr><th style="width:55%">' + esc(f[0]) + '</th><td>' + esc(f[1] || '—') + '</td></tr>';
    }).join('');

    return hoja(dg,
      '<div class="reg-head"><span>Registro N° 011</span><span>Pág. 1 de 1</span></div>' +
      '<h1>' + titulo('Revisión de la eficacia del retiro del producto del mercado', r) + '</h1>' +
      '<div class="acta-meta"><div><b>Nombre del producto:</b> ' + esc(r.producto) + '</div>' +
        '<div><b>Presentación comercial:</b> ' + esc(r.presentacion || '—') + '</div>' +
        '<div><b>Número de lote:</b> ' + esc(r.lote) + '</div>' +
        '<div><b>Fecha de vencimiento:</b> ' + esc(r.venc || 'N/A') + '</div>' +
        '<div><b>Comunicación usada:</b> ' + esc(r.comunicacion || 'Carta') + '</div>' +
        '<div><b>Disponibilidad de stock:</b> ' + recuperado(r) + ' unidad(es)</div>' +
        '<div><b>Probable causa de retiro:</b> ' + esc(r.motivo) + '</div>' +
        '<div><b>Acción correctiva:</b> retiro del mercado</div></div>' +
      '<table><thead><tr><th>Acciones de evaluación</th><th>Información</th></tr></thead><tbody>' + filas + '</tbody></table>' +
      p('<b>Conclusiones:</b> ' + esc(r.conclusiones || '')) +
      '<div class="acta-firmas"><div class="firma-line firma-sello">' + selloDT(dg) + '</div>' +
        firmaCol(D.fLocal(r.fCierre), 'Fecha') + '</div>');
  }

  /* Los diez documentos, en el orden del expediente. `key` ata a cada uno el archivo
     cargado a mano; la de los destinatarios va por posición, igual que su N° de carta. */
  function documentos(dg, r) {
    var ds = dests(r), out = [{ key: 'fab', label: 'Carta del fabricante', html: cartaFabricante(dg, r) }];
    ds.forEach(function (d, i) { out.push({ key: 'inm-' + i, label: 'Carta de inmovilización — ' + (TIPO_LABEL[d.tipo] || d.tipo), html: inmovilizacion(dg, r, d, i) }); });
    ds.forEach(function (d, i) { out.push({ key: 'resp-' + i, label: 'Respuesta — ' + (TIPO_LABEL[d.tipo] || d.tipo), html: respuesta(dg, r, d, i) }); });
    ds.forEach(function (d, i) { out.push({ key: 'ord-' + i, label: 'Registro 009 · Orden de retiro — ' + (TIPO_LABEL[d.tipo] || d.tipo), html: ordenRetiro(dg, r, d, i) }); });
    out.push({ key: 'conc', label: 'Registro 010 · Conciliación de productos retirados', html: conciliacion(dg, r) });
    out.push({ key: 'dig', label: 'Carta de comunicación a DIGEMID', html: cartaDigemid(dg, r) });
    out.push({ key: 'efi', label: 'Registro 011 · Revisión de la eficacia', html: revisionEficacia(dg, r) });
    return out;
  }

  /* ------------------------------ Archivos cargados a mano ------------------------------
     La versión firmada o escaneada de cada hoja (la carta que mandó el fabricante, la
     respuesta firmada por el cliente…) y anexos sueltos: guías, fotos, acta de destrucción.
     Suben al Drive por el único punto de subida; el registro guarda la referencia y a qué
     documento pertenece (`doc`, o 'otro'). */
  var TIPOS = /\.(pdf|docx?|xlsx|jpe?g|png)$/i, ACCEPT = '.pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png';
  function slug(s) { return D.normTxt(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

  function adjuntar(r, key, label, files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve(null);
    if (files.some(function (f) { return !TIPOS.test(f.name) || f.size >= 25 * 1024 * 1024; })) {
      UI.note('Usá PDF, Word, Excel, JPG o PNG de menos de 25 MB.');
      return Promise.resolve(null);
    }
    var dgId = store().dg().id, fallo = null;
    UI.note('Subiendo ' + files.length + ' archivo(s) a Google Drive…');
    return Promise.all(files.map(function (f) {
      var nombre = 'RETIRO_' + slug(r.lote) + '_' + slug(key === 'otro' ? f.name.replace(/\.[^.]+$/, '') : label) +
        '.' + f.name.split('.').pop().toLowerCase();
      return global.BPAPLUS.drive.subirArchivo('droguerias/' + dgId + '/retiros/' + r.id + '/' + key, f, nombre)
        .then(function (meta) { return Object.assign({ doc: key }, meta); })
        .catch(function (e) { fallo = e; return null; });
    })).then(function (metas) {
      metas = metas.filter(Boolean);
      if (!metas.length) { UI.note('No se pudo subir: ' + (fallo && fallo.message || fallo)); return null; }
      /* Lo que sí subió se guarda aunque otro haya fallado: si no, queda en Drive sin dueño. */
      var actual = store().find('retiros', r.id) || r;
      var upd = Object.assign({}, actual, { archivos: (actual.archivos || []).concat(metas) });
      return store().save('retiros', upd).then(function () {
        UI.note(metas.length + ' archivo(s) cargado(s)' +
          (fallo ? '; ' + (files.length - metas.length) + ' no se pudo subir: ' + (fallo.message || fallo) : ''));
        return upd;
      });
    });
  }

  function elegir(onFiles) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.accept = ACCEPT;
    inp.onchange = function () { onFiles(inp.files); };
    inp.click();
  }

  /* Un expediente ya armado afuera (en papel, o de un retiro anterior a la app) se sube tal
     cual: producto, lote, fecha y sus archivos, sin generar los diez documentos. */
  function cargarForm(existing) {
    var r = existing || {
      id: D.nextId(), e: store().dg().id, manual: true, simulacro: true, producto: '', lote: '',
      cartaFabFecha: D.isoHoy(), dests: [], archivos: [], createdAt: Date.now()
    };
    var m = UI.dialog({
      title: existing ? 'Editar expediente cargado' : 'Cargar expediente de retiro',
      body:
        '<p class="dialog-note">Para un expediente que ya tenés armado: se guardan los archivos tal cual, ' +
          'sin generar los documentos.</p>' +
        '<div class="field"><label><input type="checkbox" id="x_sim"' + (sim(r) ? ' checked' : '') + '> Es un simulacro</label></div>' +
        '<div class="field" id="wrap_xprod"><label>Producto</label><input class="inp" id="x_prod" value="' + esc(r.producto) +
          '"><div class="err">Ingresá el producto.</div></div>' +
        '<div class="grid-2"><div class="field" id="wrap_xlote"><label>Lote / serie</label><input class="inp mono" id="x_lote" value="' +
          esc(r.lote) + '"><div class="err">Ingresá el lote.</div></div>' +
          '<div class="field"><label>Fecha del retiro</label><input class="inp" id="x_fecha" type="date" value="' + esc(r.cartaFabFecha || '') + '"></div></div>' +
        '<div class="field"><label>Archivos del expediente</label><input class="inp" id="x_files" type="file" multiple accept="' + ACCEPT + '">' +
          '<div class="hint">PDF, Word, Excel, JPG o PNG de menos de 25 MB; podés elegir varios.' +
          (existing ? ' Se agregan a los que ya tiene.' : '') + '</div></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button>' +
        '<button class="btn btn-primary" id="x_save">' + (existing ? 'Guardar' : 'Cargar') + '</button>',
      onMount: function (root) {
        var btn = root.querySelector('#x_save');
        btn.onclick = function () {
          function v(id) { return root.querySelector(id).value.trim(); }
          var prod = v('#x_prod'), lote = v('#x_lote'), files = root.querySelector('#x_files').files;
          if (!prod) { root.querySelector('#wrap_xprod').classList.add('invalid'); root.querySelector('#x_prod').focus(); return; }
          if (!lote) { root.querySelector('#wrap_xlote').classList.add('invalid'); root.querySelector('#x_lote').focus(); return; }
          if (!existing && !files.length) { UI.note('Elegí los archivos del expediente.'); return; }
          var obj = Object.assign({}, (existing && store().find('retiros', r.id)) || r, {
            simulacro: root.querySelector('#x_sim').checked, producto: prod, lote: lote,
            cartaFabFecha: v('#x_fecha') || D.isoHoy()
          });
          btn.disabled = true;
          /* Uno nuevo solo se guarda si sube al menos un archivo: así no quedan expedientes vacíos. */
          (existing ? store().save('retiros', obj) : Promise.resolve())
            .then(function () { return files.length ? adjuntar(obj, 'otro', '', files) : obj; })
            .then(function (upd) {
              if (!upd) { btn.disabled = false; return; }
              m.close(); if (!files.length) UI.note('Expediente actualizado');
            }).catch(function () { btn.disabled = false; });
        };
      }
    });
  }

  function imprimir(dg, r, i) { A().print(documentos(dg, r)[i].html); }
  function imprimirTodo(dg, r) { A().print(documentos(dg, r).map(function (d) { return d.html; }).join('')); }

  /* ------------------------------ Vista ------------------------------ */
  function view() {
    var S = store(), dg = S.dg(), rs = S.byDg('retiros').slice();
    rs.sort(function (a, b) { return String(b.cartaFabFecha).localeCompare(String(a.cartaFabFecha)); });
    return '' +
      '<div class="view-header"><div><div class="view-title">Retiro de mercado</div>' +
        '<div class="view-sub">' + rs.length + ' simulacro(s) · ' + esc(dg.nombre) + '</div></div>' +
        '<div class="header-actions"><button class="btn btn-ghost" data-action="cargar-retiro">' +
          icon('upload', 16) + 'Cargar expediente</button>' +
          '<button class="btn btn-primary" data-action="nuevo-retiro">' +
          icon('plus', 16) + 'Nuevo simulacro</button></div></div>' +
      (rs.length ? '<div class="list">' + rs.map(row).join('') + '</div>'
        : '<div class="empty">' + icon('flag', 32) + '<span class="es-title">Sin simulacros de retiro</span>' +
          '<span class="es-sub">Cargá el producto, el lote y a quién se le distribuyó: BPA-Plus arma los diez ' +
          'documentos del expediente. Si ya lo tenés armado, subilo con «Cargar expediente».</span></div>');
  }

  function row(r) {
    var n = (r.archivos || []).length;
    return '<div class="row" data-retiro="' + esc(r.id) + '"><div class="row-top"><div class="chan insp"></div><div class="row-main">' +
      '<div class="row-name">' + esc(r.producto) + '</div>' +
      '<div class="row-meta"><span>Lote ' + esc(r.lote) + '</span>' +
        (r.manual ? '' : '<span><b>Destinatarios</b>' + dests(r).length + '</span>' +
          '<span><b>Recuperado</b>' + recuperado(r) + ' de ' + distribuida(r) + '</span>') +
        (n ? '<span><b>Archivos</b>' + n + '</span>' : '') + '</div>' +
      '<div class="row-sub"><span class="row-plain">' +
        (r.manual ? 'Expediente cargado' : esc(r.fabricante) + ' · carta N° ' + esc(r.cartaFabNum || '—')) +
        ' · ' + esc(D.fLocal(r.cartaFabFecha)) + '</span></div></div>' +
      tag(sim(r) ? 'pendiente' : 'vencido', sim(r) ? 'Simulacro' : 'Retiro real') + '</div>' +
      (r.manual ? '' : '<div class="row-foot"><button class="link-btn" data-retiro-print="' + esc(r.id) + '">' +
        icon('print', 14) + ' Imprimir expediente</button></div>') + '</div>';
  }

  /* Un expediente cargado (`manual`) son solo sus archivos: no genera documentos. */
  function panel(r) {
    var dg = store().dg(), docs = r.manual ? [] : documentos(dg, r), arch = r.archivos || [];
    var keys = docs.map(function (d) { return d.key; });
    /* Un archivo cuyo documento ya no existe (se quitó un destinatario) no se esconde: pasa a «Otros». */
    function adjuntos(k) {
      return arch.map(function (a, i) {
        if (k === 'otro' ? keys.indexOf(a.doc) >= 0 : a.doc !== k) return '';
        return '<div class="file-item-row"' + (k === 'otro' ? '' : ' style="margin-left:22px"') + '>' +
          '<button class="file-item" data-ver="' + i + '">' + icon('doc', 15) +
          '<span><b>' + esc(a.name) + '</b><small>Vista previa</small></span></button>' +
          '<button class="icon-btn del" data-quitar="' + i + '" aria-label="Quitar ' + esc(a.name) + '">' + icon('trash', 16) + '</button></div>';
      }).join('');
    }
    var otros = adjuntos('otro');
    var p = UI.panel({
      title: r.manual ? 'Expediente de retiro' : 'Simulacro de retiro',
      body:
        '<div class="panel-lead"><div><div class="row-code mono">Lote ' + esc(r.lote) + '</div>' +
          '<div class="panel-lead-title">' + esc(r.producto) + '</div></div>' +
          tag(sim(r) ? 'pendiente' : 'vencido', sim(r) ? 'Simulacro' : 'Retiro real') + '</div>' +
        (r.manual ? detalle('Fecha del retiro', D.fLocal(r.cartaFabFecha)) :
        detalle('Fabricante', r.fabricante) +
        detalle('Carta del fabricante', (r.cartaFabNum || '—') + ' · ' + D.fLocal(r.cartaFabFecha)) +
        detalle('Motivo', r.motivo) + detalle('Registro sanitario', r.rs || '—') +
        detalle('Recuperado', recuperado(r) + ' de ' + distribuida(r) + ' unidad(es) distribuida(s)')) +
        (r.manual ? '' : '<div class="section-title">Expediente (' + docs.length + ' documentos' +
          (arch.length ? ' · ' + arch.length + ' archivo(s) cargado(s)' : '') + ')</div>' +
        '<p class="dialog-note">Imprimí cada hoja y, con ' + icon('upload', 13) + ', cargá su versión firmada o escaneada.</p>' +
        '<div class="file-list">' +
        docs.map(function (d, i) {
          return '<div class="file-item-row"><button class="file-item" data-doc="' + i + '">' + icon('print', 15) +
            '<span><b>' + (i + 1) + '. ' + esc(d.label) + '</b></span></button>' +
            '<button class="icon-btn" data-up="' + d.key + '" title="Cargar archivo" aria-label="Cargar archivo de ' + esc(d.label) + '">' +
              icon('upload', 16) + '</button></div>' + adjuntos(d.key);
        }).join('') + '</div>' +
        '<button class="btn btn-primary btn-sm" data-all style="margin-top:12px">' + icon('print', 14) +
          'Imprimir los ' + docs.length + '</button>') +
        '<div class="section-title">' + (r.manual ? 'Archivos del expediente (' + arch.length + ')' : 'Otros archivos') + '</div>' +
        (otros ? '<div class="file-list">' + otros + '</div>'
          : '<div class="row-empty">' + (r.manual ? 'Sin archivos cargados.'
            : 'Guías, fotos, acta de destrucción u otro respaldo del retiro.') + '</div>') +
        '<button class="btn btn-ghost btn-sm" data-up="otro" style="margin-top:8px">' + icon('upload', 14) + 'Agregar archivo</button>',
      footer:
        '<button class="btn btn-ghost" data-edit>' + icon('edit', 16) + 'Editar</button>' +
        '<button class="btn btn-danger" data-del>' + icon('trash', 16) + 'Eliminar</button>',
      onMount: function (root) {
        root.querySelectorAll('[data-doc]').forEach(function (b) {
          b.onclick = function () { imprimir(dg, r, +b.dataset.doc); };
        });
        if (docs.length) root.querySelector('[data-all]').onclick = function () { imprimirTodo(dg, r); };
        function reabrir(upd) { if (upd && document.body.contains(root)) { p.close(); panel(upd); } }
        root.querySelectorAll('[data-up]').forEach(function (b) {
          b.onclick = function () {
            var d = docs[keys.indexOf(b.dataset.up)];
            elegir(function (files) {
              adjuntar(r, b.dataset.up, d ? d.label : '', files).then(reabrir).catch(function () {});
            });
          };
        });
        root.querySelectorAll('[data-ver]').forEach(function (b) {
          b.onclick = function () {
            global.BPAPLUS.drive.previewStored(arch[+b.dataset.ver]).catch(function (e) { UI.note(e.message || e); });
          };
        });
        root.querySelectorAll('[data-quitar]').forEach(function (b) {
          b.onclick = function () {
            var a = arch[+b.dataset.quitar];
            UI.confirm({ title: 'Quitar archivo', okLabel: 'Quitar', danger: true,
              message: '«' + a.name + '» deja de figurar en el expediente. El archivo sigue en tu Google Drive.' })
              .then(function (ok) {
                if (!ok) return;
                var actual = store().find('retiros', r.id) || r;
                var upd = Object.assign({}, actual, {
                  archivos: (actual.archivos || []).filter(function (x) { return x.driveId !== a.driveId; })
                });
                return store().save('retiros', upd).then(function () { reabrir(upd); UI.note('Archivo quitado del expediente'); });
              }).catch(function () {});
          };
        });
        root.querySelector('[data-edit]').onclick = function () {
          root.querySelector('[data-close]').click(); (r.manual ? cargarForm : form)(r);
        };
        root.querySelector('[data-del]').onclick = function () {
          root.querySelector('[data-close]').click();
          store().removeWithUndo('retiros', r, 'Simulacro eliminado');
        };
      }
    });
  }

  function detalle(k, v) {
    return '<div class="detail-row"><span class="detail-k">' + esc(k) + '</span><span class="detail-v">' + esc(v) + '</span></div>';
  }

  /* ------------------------------ Formulario ------------------------------ */
  function destRow(d) {
    d = d || { tipo: 'cliente', cargo: 'Gerente General' };
    return '<div class="dest-row">' +
      '<div class="grid-2"><div class="field"><label>Tipo</label><select class="inp d-tipo">' +
        ['almacen', 'cliente'].map(function (t) {
          return '<option value="' + t + '"' + (d.tipo === t ? ' selected' : '') + '>' + TIPO_LABEL[t] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>Razón social</label><input class="inp d-nom" value="' + esc(d.nombre || '') + '"></div></div>' +
      '<div class="grid-2"><div class="field"><label>RUC</label><input class="inp mono d-ruc" value="' + esc(d.ruc || '') + '"></div>' +
        '<div class="field"><label>Guía de remisión o factura</label><input class="inp d-guia" value="' + esc(d.guia || '') + '"></div></div>' +
      '<div class="field"><label>Dirección</label><input class="inp d-dir" value="' + esc(d.direccion || '') + '"></div>' +
      '<div class="grid-2"><div class="field"><label>Quien firma la respuesta</label><input class="inp d-firm" value="' + esc(d.firmante || '') + '"></div>' +
        '<div class="field"><label>Cargo</label><input class="inp d-cargo" value="' + esc(d.cargo || '') + '"></div></div>' +
      '<div class="grid-2"><div class="field"><label>Unidades entregadas</label><input class="inp mono d-ent" type="number" min="0" value="' + num(d.entregada) + '"></div>' +
        '<div class="field"><label>Stock inmovilizado (recuperado)</label><input class="inp mono d-stk" type="number" min="0" value="' + num(d.stock) + '"></div></div>' +
      '<div class="grid-2"><div class="field"><label>Fecha de la carta</label><input class="inp d-fc" type="date" value="' + esc(d.fechaCarta || '') + '"></div>' +
        '<div class="field"><label>Fecha de la respuesta</label><input class="inp d-fr" type="date" value="' + esc(d.fechaResp || '') + '"></div></div>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-deldest>' + icon('x', 14) + 'Quitar destinatario</button></div>';
  }

  function leerDest(el) {
    function v(sel) { var n = el.querySelector(sel); return n ? n.value.trim() : ''; }
    return {
      tipo: v('.d-tipo'), nombre: v('.d-nom'), ruc: v('.d-ruc'), direccion: v('.d-dir'),
      firmante: v('.d-firm'), cargo: v('.d-cargo'), guia: v('.d-guia'),
      entregada: num(v('.d-ent')), stock: num(v('.d-stk')),
      fechaCarta: v('.d-fc'), fechaResp: v('.d-fr')
    };
  }

  /* LogisticS entrega una ficha ya acotada a la droguería coincidente. Acá solo se
     traduce su vocabulario al registro único del expediente de retiro. */
  function desdeLogistics(dg, l) {
    var hoy = D.isoHoy();
    var ds = [{
      tipo: 'almacen', nombre: dg.nombre + ' — Almacén', ruc: dg.ruc || '', direccion: dg.direccion || '',
      cargo: 'Jefe de Almacén', guia: l.guideNo || '', entregada: num(l.quantity), stock: num(l.stock),
      fechaCarta: hoy, fechaResp: ''
    }].concat((l.clients || []).map(function (c) {
      return {
        tipo: 'cliente', nombre: c.name || c.destination || '', ruc: c.ruc || '', direccion: c.address || '',
        cargo: 'Gerente General', guia: c.guide || '', entregada: num(c.quantity), stock: 0,
        fechaCarta: hoy, fechaResp: ''
      };
    }).filter(function (d) { return d.nombre; }));
    return {
      producto: l.product || '', codigo: l.assignedId || '', lote: l.batch || '',
      presentacion: l.product ? 'Unidad — ' + l.product + (l.model ? ', modelo ' + l.model : '') : '',
      venc: l.expiration || 'N/A', rs: l.rs || '', distribuida: num(l.quantity),
      factura: [l.invoiceNo, l.supplier, l.importNo && 'importación ' + l.importNo].filter(Boolean).join(' — '),
      facturaFecha: l.invoiceDate || l.entryDate || '', fabricante: l.manufacturer || '', dests: ds
    };
  }

  function aplicarLogistics(root, lot) {
    var r = desdeLogistics(store().dg(), lot);
    var fields = {
      '#r_prod': r.producto, '#r_cod': r.codigo, '#r_lote': r.lote, '#r_pres': r.presentacion,
      '#r_venc': r.venc, '#r_rs': r.rs, '#r_fact': r.factura, '#r_factf': r.facturaFecha,
      '#r_dist': r.distribuida, '#r_fab': r.fabricante
    };
    Object.keys(fields).forEach(function (sel) { root.querySelector(sel).value = fields[sel]; });
    root.querySelector('#destList').innerHTML = r.dests.map(destRow).join('');
    UI.note('Datos de LogisticS cargados; revisá el stock recuperado antes de guardar.');
  }

  function elegirLoteLogistics(root, payload) {
    var lots = payload && payload.lots || [];
    if (!lots.length) { UI.note('La droguería coincidente no tiene lotes en LogisticS.'); return; }
    var m = UI.dialog({
      title: 'Traer lote de LogisticS',
      body: '<div class="field"><label>Lote / serie</label><select class="inp" id="log_lot">' + lots.map(function (l, i) {
        return '<option value="' + i + '">' + esc([l.importNo, l.product, 'lote ' + l.batch].filter(Boolean).join(' · ')) + '</option>';
      }).join('') + '</select></div><p class="dialog-note">Coincidencia: ' + esc(payload.drogueria && payload.drogueria.name || '') + '</p>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-use-logistics>Usar datos</button>',
      onMount: function (pick) {
        pick.querySelector('[data-use-logistics]').onclick = function () {
          aplicarLogistics(root, lots[+pick.querySelector('#log_lot').value]); m.close();
        };
      }
    });
  }

  function conectarLogistics(root) {
    var url = global.BPAPLUS_CONFIG && global.BPAPLUS_CONFIG.logisticsUrl;
    if (!url) { UI.note('Falta configurar logisticsUrl.'); return; }
    var target = new URL(url, location.href).origin, requestId = D.nextId(), dg = store().dg();
    var popup = global.open(url, 'bpa-logistics');
    if (!popup) { UI.note('El navegador bloqueó LogisticS. Habilitá las ventanas emergentes.'); return; }
    var button = root.querySelector('[data-logistics]'), timer, timeout;
    if (button) button.disabled = true;
    function finish() {
      clearInterval(timer); clearTimeout(timeout); global.removeEventListener('message', receive);
      if (button) button.disabled = false;
    }
    function send() {
      popup.postMessage({
        type: 'bpa-retiro-request', requestId: requestId,
        drogueria: { name: dg.nombre || '', shortCode: dg.init || '', ruc: dg.ruc || '' }
      }, target);
    }
    function receive(e) {
      if (e.origin !== target || e.source !== popup || !e.data || e.data.type !== 'logistics-retiro-data' || e.data.requestId !== requestId) return;
      finish();
      if (e.data.error) UI.note(e.data.error); else elegirLoteLogistics(root, e.data.payload);
      try { popup.close(); } catch (ignore) {}
    }
    global.addEventListener('message', receive);
    timer = setInterval(send, 700); send();
    timeout = setTimeout(function () {
      finish(); UI.note('LogisticS no respondió. Iniciá sesión, desbloquealo y volvé a intentar.');
    }, 120000);
  }

  function form(existing) {
    var r = existing || nuevo(store().dg().id);
    var m = UI.dialog({
      title: existing ? 'Editar simulacro' : 'Nuevo simulacro de retiro', wide: true,
      body:
        '<div class="field"><label><input type="checkbox" id="r_sim"' + (sim(r) ? ' checked' : '') +
          '> Es un simulacro (se marca en los diez documentos)</label></div>' +

        '<div class="section-title">Producto</div>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-logistics>' + icon('download', 14) + 'Traer de LogisticS</button>' +
        '<div class="field" id="wrap_prod"><label>Producto</label><input class="inp" id="r_prod" value="' + esc(r.producto) +
          '"><div class="err">Ingresá el producto.</div></div>' +
        '<div class="grid-2"><div class="field"><label>Código</label><input class="inp mono" id="r_cod" value="' + esc(r.codigo || '') + '"></div>' +
          '<div class="field" id="wrap_lote"><label>Lote / serie</label><input class="inp mono" id="r_lote" value="' + esc(r.lote) +
            '"><div class="err">Ingresá el lote.</div></div></div>' +
        '<div class="grid-2"><div class="field"><label>Presentación comercial</label><input class="inp" id="r_pres" value="' + esc(r.presentacion || '') + '"></div>' +
          '<div class="field"><label>Fecha de vencimiento</label><input class="inp" id="r_venc" value="' + esc(r.venc || '') + '" placeholder="N/A"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Registro sanitario</label><input class="inp mono" id="r_rs" value="' + esc(r.rs || '') + '"></div>' +
          '<div class="field"><label>Factura / invoice del ingreso</label><input class="inp" id="r_fact" value="' + esc(r.factura || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Fecha de la factura</label><input class="inp" id="r_factf" type="date" value="' + esc(r.facturaFecha || '') + '"></div>' +
          '<div class="field"><label>Unidades del lote (importación)</label><input class="inp mono" id="r_dist" type="number" min="0" value="' + distribuida(r) + '"></div></div>' +

        '<div class="section-title">Carta del fabricante</div>' +
        '<div class="grid-2"><div class="field"><label>Fabricante</label><input class="inp" id="r_fab" value="' + esc(r.fabricante || '') + '"></div>' +
          '<div class="field"><label>N° de carta</label><input class="inp mono" id="r_cnum" value="' + esc(r.cartaFabNum || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Fecha de la carta</label><input class="inp" id="r_cfec" type="date" value="' + esc(r.cartaFabFecha || '') + '"></div>' +
          '<div class="field"><label>Quien firma</label><input class="inp" id="r_cfirm" value="' + esc(r.fabFirmante || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Cargo de quien firma</label><input class="inp" id="r_ccargo" value="' + esc(r.fabCargo || '') + '"></div>' +
          '<div class="field"><label>Motivo del retiro</label><input class="inp" id="r_mot" value="' + esc(r.motivo || '') + '"></div></div>' +

        '<div class="section-title">Destinatarios</div>' +
        '<div id="destList">' + dests(r).map(destRow).join('') + '</div>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="r_adddest">' + icon('plus', 14) + 'Agregar destinatario</button>' +

        '<div class="section-title">Cierre y eficacia</div>' +
        '<div class="grid-2"><div class="field"><label>Representante legal</label><input class="inp" id="r_rep" value="' + esc(r.repLegal || '') + '"></div>' +
          '<div class="field"><label>Comunicación usada</label><input class="inp" id="r_com" value="' + esc(r.comunicacion || 'Carta') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Primera solicitud de retiro</label><input class="inp" id="r_fsol" type="date" value="' + esc(r.fSolicitud || '') + '"></div>' +
          '<div class="field"><label>Ingreso del primer producto</label><input class="inp" id="r_fing" type="date" value="' + esc(r.fIngreso || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Ingreso del último producto</label><input class="inp" id="r_fingu" type="date" value="' + esc(r.fIngresoUlt || '') + '"></div>' +
          '<div class="field"><label>Destrucción del producto</label><input class="inp" id="r_fdes" type="date" value="' + esc(r.fDestruccion || '') + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Costo de comercialización</label><input class="inp mono" id="r_cc" type="number" step="0.01" min="0" value="' + num(r.costoComercial) + '"></div>' +
          '<div class="field"><label>Costo del proceso de retiro</label><input class="inp mono" id="r_cp" type="number" step="0.01" min="0" value="' + num(r.costoProceso) + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Unidades vencidas</label><input class="inp mono" id="r_venc2" type="number" min="0" value="' + num(r.vencidas) + '"></div>' +
          '<div class="field"><label>Comunicación a DIGEMID</label><input class="inp" id="r_dig" type="date" value="' + esc(r.digemidFecha || '') + '"></div></div>' +
        '<div class="field"><label>Conclusiones</label><textarea class="inp" id="r_conc" rows="3">' + esc(r.conclusiones || '') + '</textarea></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="r_save">Guardar</button>',
      onMount: function (root) {
        var list = root.querySelector('#destList');
        root.querySelector('[data-logistics]').onclick = function () { conectarLogistics(root); };
        root.querySelector('#r_adddest').onclick = function () {
          var div = document.createElement('div'); div.innerHTML = destRow(null);
          list.appendChild(div.firstChild);
        };
        list.addEventListener('click', function (e) {
          var b = e.target.closest('[data-deldest]'); if (b) b.closest('.dest-row').remove();
        });
        root.querySelector('#r_save').onclick = function () {
          function v(id) { return root.querySelector(id).value.trim(); }
          var prod = v('#r_prod'), lote = v('#r_lote');
          if (!prod) { root.querySelector('#wrap_prod').classList.add('invalid'); root.querySelector('#r_prod').focus(); return; }
          if (!lote) { root.querySelector('#wrap_lote').classList.add('invalid'); root.querySelector('#r_lote').focus(); return; }
          var ds = Array.prototype.map.call(list.querySelectorAll('.dest-row'), leerDest)
            .filter(function (d) { return d.nombre; });
          if (!ds.length) { UI.note('Agregá al menos un destinatario: sin él no hay carta de inmovilización ni orden de retiro.'); return; }
          var obj = Object.assign({}, existing || {}, {
            id: existing ? existing.id : D.nextId(), e: store().dg().id,
            simulacro: root.querySelector('#r_sim').checked,
            producto: prod, codigo: v('#r_cod'), lote: lote, presentacion: v('#r_pres'), venc: v('#r_venc'),
            rs: v('#r_rs'), factura: v('#r_fact'), facturaFecha: v('#r_factf'), distribuida: num(v('#r_dist')),
            fabricante: v('#r_fab'), cartaFabNum: v('#r_cnum'), cartaFabFecha: v('#r_cfec') || D.isoHoy(),
            fabFirmante: v('#r_cfirm'), fabCargo: v('#r_ccargo'), motivo: v('#r_mot') || 'un problema de calidad',
            dests: ds, repLegal: v('#r_rep'), comunicacion: v('#r_com'),
            fSolicitud: v('#r_fsol'), fIngreso: v('#r_fing'), fIngresoUlt: v('#r_fingu'),
            fDestruccion: v('#r_fdes'), digemidFecha: v('#r_dig'),
            costoComercial: num(v('#r_cc')), costoProceso: num(v('#r_cp')), vencidas: num(v('#r_venc2')),
            conclusiones: v('#r_conc'), fCierre: v('#r_dig') || D.isoHoy(),
            createdAt: (existing && existing.createdAt) || Date.now()
          });
          store().save('retiros', obj).then(function () {
            m.close(); UI.note(existing ? 'Simulacro actualizado' : 'Simulacro creado');
          });
        };
      }
    });
  }

  function nuevo(dgId) {
    return {
      id: '', e: dgId, simulacro: true, producto: '', codigo: '', lote: '', presentacion: '', venc: 'N/A',
      rs: '', factura: '', facturaFecha: '', fabricante: '', cartaFabNum: '', cartaFabFecha: D.isoHoy(),
      fabFirmante: '', fabCargo: '', motivo: 'un problema de calidad',
      dests: [
        { tipo: 'almacen', cargo: 'Jefe de Almacén', fechaCarta: D.isoHoy() },
        { tipo: 'cliente', cargo: 'Gerente General', fechaCarta: D.isoHoy() }
      ],
      repLegal: '', comunicacion: 'Carta', fSolicitud: '', fIngreso: '', fIngresoUlt: '', fDestruccion: '',
      digemidFecha: '', costoComercial: 0, costoProceso: 0, vencidas: 0, conclusiones: ''
    };
  }

  /* ------------------------------ Datos de ejemplo ------------------------------
     Una importación real de LogisticS, exportada desde su ficha: IMP-0004 del
     26/08/2026 (proveedor AMPRONIX, monitor médico LG 32HR734S, serie
     409NTHMB2561, RS CRS_DB9783E) con su salida del 27/08. La causa del retiro
     es el evento que trae su propio kardex: el 01/09 la revisión organoléptica
     devolvió el lote a cuarentena. */
  function ejemplo(dgId) {
    return {
      id: D.nextId(), e: dgId, simulacro: true,
      producto: 'MONITOR MÉDICO LG 32HR734S', codigo: 'ALM-0005', lote: '409NTHMB2561',
      presentacion: 'Unidad — monitor médico para uso clínico, modelo 32HR734S',
      venc: 'N/A', rs: 'CRS_DB9783E', distribuida: 1,
      factura: '462079 — AMPRONIX, importación IMP-0004', facturaFecha: '2026-08-26',
      fabricante: 'LG Electronics Inc', cartaFabNum: '01-2026', cartaFabFecha: '2026-09-01',
      fabFirmante: '', fabCargo: 'Representante autorizado',
      motivo: 'una no conformidad de calidad detectada en la revisión organoléptica, que devolvió el lote a cuarentena',
      dests: [
        {
          tipo: 'almacen', nombre: 'INTELLIGENCE TECHNOLOGY COMPANY S.A.C. — Almacén', ruc: '20608966405',
          direccion: 'Av. Manuel Olguín 501, Int. 1105 — Santiago de Surco, Lima',
          firmante: '', cargo: 'Jefe de Almacén', guia: 'GRE T001-27673',
          entregada: 1, stock: 0, fechaCarta: '2026-09-02', fechaResp: '2026-09-03'
        },
        {
          tipo: 'cliente', nombre: 'INTELLIGENCE TECHNOLOGY COMPANY S.A.C.', ruc: '20608966405',
          direccion: 'Av. Manuel Olguín 501, Int. 1105 — Santiago de Surco, Lima',
          firmante: '', cargo: 'Gerente General', guia: 'GRE EG07-00000285',
          entregada: 1, stock: 1, fechaCarta: '2026-09-02', fechaResp: '2026-09-03'
        }
      ],
      repLegal: 'ALVAREZ URIBE ORLANDO ENRIQUE', comunicacion: 'Carta',
      fSolicitud: '2026-09-02', fIngreso: '2026-09-03', fIngresoUlt: '2026-09-03', fDestruccion: '',
      digemidFecha: '2026-09-04', costoComercial: 0, costoProceso: 0, vencidas: 0,
      conclusiones: 'Se procede con el retiro de la unidad del monitor médico LG 32HR734S, serie 409NTHMB2561, ' +
        'ingresada con la importación IMP-0004 y despachada el 27/08/2026, por la no conformidad detectada en la ' +
        'revisión organoléptica del 01/09/2026. El almacén ya no tenía stock y se recuperó la única unidad ' +
        'distribuida: 100 % de eficacia.',
      fCierre: '2026-09-04', createdAt: Date.now()
    };
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.retiro = {
    view: view, form: form, panel: panel, documentos: documentos,
    imprimir: imprimir, imprimirTodo: imprimirTodo, ejemplo: ejemplo, nuevo: nuevo,
    desdeLogistics: desdeLogistics, adjuntar: adjuntar, cargarForm: cargarForm
  };
})(window);
