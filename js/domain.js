/* ==========================================================================
   BPA-Plus — domain.js
   Reglas de negocio puras: sin DOM, sin estado global. Vigencia de
   documentos, estado de capacitaciones, clasificación por criterio y
   cálculo del puntaje de cumplimiento BPA.
   ========================================================================== */
(function (global) {
  'use strict';

  var EST = Object.freeze({
    VIGENTE: 'vigente', POR_VENCER: 'por_vencer', VENCIDO: 'vencido',
    REALIZADA: 'realizada', PENDIENTE: 'pendiente', VENCIDA: 'vencida'
  });

  var EST_LABEL = {
    vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido',
    realizada: 'Realizada', pendiente: 'Pendiente', vencida: 'Vencida'
  };

  var VENTANA_POR_VENCER = 60; // días

  /* ----- Fechas (ISO local, sin desfase UTC) ----- */
  function hoyLocal() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  function parseISOLocal(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function dias(iso) {
    var f = parseISOLocal(iso);
    if (!f) return Infinity;
    return Math.round((f - hoyLocal()) / 864e5);
  }

  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isoHoy() { return isoLocal(hoyLocal()); }
  function isoDesdeHoy(n) { return isoLocal(new Date(hoyLocal().getTime() + n * 864e5)); }

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

  function fLocal(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return (+p[2]) + ' ' + MESES[+p[1] - 1] + ' ' + p[0];
  }
  function fLarga(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return (+p[2]) + ' de ' + MESES_LARGO[+p[1] - 1] + ' de ' + p[0];
  }

  function fDias(n) {
    if (!isFinite(n)) return { txt: 'Sin fecha', cls: 'muted' };
    if (n < 0) return { txt: 'Vencido hace ' + Math.abs(n) + ' d', cls: 'late' };
    if (n === 0) return { txt: 'Vence hoy', cls: 'soon' };
    if (n <= 30) return { txt: 'En ' + n + ' días', cls: 'soon' };
    return { txt: 'En ' + n + ' días', cls: 'ok' };
  }

  /* ----- Estado documento / capacitación ----- */
  function edoc(d) {
    var n = dias(d && d.rev);
    if (n < 0) return EST.VENCIDO;
    if (n <= VENTANA_POR_VENCER) return EST.POR_VENCER;
    return EST.VIGENTE;
  }
  function ecap(c) {
    if (c && c.est === EST.REALIZADA) return EST.REALIZADA;
    return dias(c && c.fecha) < 0 ? EST.VENCIDA : EST.PENDIENTE;
  }

  /* ==========================================================================
     Clasificación por criterio
     ========================================================================== */
  var CRITERIOS_DEFAULT = ['POEs', 'Formatos', 'Instructivos', 'Registros', 'Manuales'];
  var MISC_LABEL = 'Otros';

  function normTxt(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  function stemTxt(s) { var n = normTxt(s); return n.endsWith('s') ? n.slice(0, -1) : n; }

  var CRITERIO_SINONIMOS = {
    poe: { palabras: ['poe', 'sop', 'pnt', 'pno', 'procedimiento'], prefijos: ['POE', 'SOP', 'PNT', 'PNO', 'PR', 'PRO', 'PROC'] },
    formato: { palabras: ['formato', 'registro', 'planilla', 'fmt'], prefijos: ['FOR', 'FMT', 'FO', 'REG', 'RG', 'FORM'] },
    instructivo: { palabras: ['instructivo', 'instruccion', 'it', 'manual', 'guia'], prefijos: ['INS', 'INST', 'IT', 'INC', 'MAN', 'GUIA', 'GU'] }
  };

  function grupoDe(critStem) {
    if (/^poe/.test(critStem) || /^sop/.test(critStem) || /procedimiento/.test(critStem)) return 'poe';
    if (/^formato/.test(critStem) || /^registro/.test(critStem)) return 'formato';
    if (/^instructivo/.test(critStem) || /^manual/.test(critStem) || /^guia/.test(critStem)) return 'instructivo';
    return null;
  }
  function prefijoExacto(token, prefijos) {
    var letras = (token.match(/^[A-Za-zÁÉÍÓÚáéíóúñÑ]+/) || [''])[0].toUpperCase();
    return prefijos.some(function (pre) { return letras === pre.toUpperCase(); });
  }

  function clasificarPorCriterio(nombre, criterios) {
    criterios = criterios && criterios.length ? criterios : CRITERIOS_DEFAULT;
    var original = (nombre || '').replace(/\.[^.]+$/, '');
    var clean = normTxt(original);
    var primerToken = (original.match(/^[A-Za-zÁÉÍÓÚáéíóúñÑ]+[\s_-]?\d+/) || [''])[0].replace(/[\s_-]/g, '');
    var tokens = original.match(/[A-Za-zÁÉÍÓÚáéíóúñÑ]+[\s_-]?\d+/g) || [];

    for (var i = 0; i < criterios.length; i++) {
      var crit = criterios[i], critN = normTxt(crit), critStem = stemTxt(crit);
      if (clean.startsWith(critN) || clean.startsWith(critStem)) return crit;
      var g = grupoDe(critStem);
      if (g && primerToken && prefijoExacto(primerToken, CRITERIO_SINONIMOS[g].prefijos)) return crit;
    }
    for (var j = 0; j < criterios.length; j++) {
      var cs = stemTxt(criterios[j]);
      if (new RegExp('\\b' + cs + 's?\\b').test(clean)) return criterios[j];
    }
    for (var k = 0; k < criterios.length; k++) {
      var gg = grupoDe(stemTxt(criterios[k]));
      if (!gg) continue;
      var def = CRITERIO_SINONIMOS[gg];
      if (def.palabras.some(function (p) { return new RegExp('\\b' + p + '\\b').test(clean); })) return criterios[k];
      if (tokens.some(function (t) { return prefijoExacto(t.replace(/[\s_-]/g, ''), def.prefijos); })) return criterios[k];
    }
    return MISC_LABEL;
  }

  function numeroEnNombre(nombre) {
    var m = (nombre || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : Infinity;
  }

  /* ==========================================================================
     Puntaje de cumplimiento
     ========================================================================== */
  function scoreCumplimiento(docs, caps, insp) {
    var dV = docs.filter(function (d) { return edoc(d) === EST.VENCIDO; }).length;
    var cV = caps.filter(function (c) { return ecap(c) === EST.VENCIDA; }).length;
    var iVenc = insp.filter(function (i) { return !i.real && dias(i.prog) < 0; }).length;
    var iHall = insp.filter(function (i) { return i.real && (i.hall || 0) > 0; }).length;

    var docsOK = docs.length - dV;
    var capsOK = caps.length - cV;
    var inspOK = insp.length - iVenc - iHall;
    var total = docs.length + caps.length + insp.length;
    var score = total ? Math.round(((docsOK + capsOK + inspOK) / total) * 100) : 100;
    score = Math.max(0, Math.min(100, score));
    var cls = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
    var msg = score >= 85 ? 'Cumplimiento sólido' : score >= 60 ? 'Atención requerida' : 'Riesgo alto de incumplimiento';
    return {
      score: score, cls: cls, msg: msg,
      docsOK: docsOK, capsOK: capsOK, inspOK: inspOK,
      docsTot: docs.length, capsTot: caps.length, inspTot: insp.length
    };
  }

  var _c = 0;
  function nextId() { return Date.now().toString(36) + '_' + (_c++).toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

  var SEV_LABEL = { critico: 'Crítico', mayor: 'Mayor', menor: 'Menor', informativo: 'Informativo', '': '' };

  /* ----- Checklist oficial: Acta de Inspección al Almacén (REGISTRO_004, DIGEMID) -----
     Transcrito del formato oficial. 15 secciones, cada ítem con severidad
     (crítico / mayor / menor / informativo) y respuesta sí/no + observación. */
  function checklistOficial() {
    return [
      { seccion: 'SISTEMA DE ASEGURAMIENTO DE LA CALIDAD', items: [
        { ref: 'a', texto: '¿Las operaciones que realiza el Establecimiento están claramente especificadas por escrito u otro medio autorizado y validado, cuando corresponda?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Las funciones y responsabilidades del personal están claramente especificadas en las descripciones de trabajo?', severidad: 'mayor' },
        { ref: 'c', texto: '¿Se establecen y aplican procedimientos necesarios para asegurar que los productos sean manipulados y almacenados debidamente, a fin de que su calidad, eficacia, seguridad y funcionalidad se mantenga según las especificaciones del fabricante autorizadas en el Registro Sanitario y/o NSO?', severidad: 'mayor' },
        { ref: 'd', texto: '¿Se efectúan los controles a los productos, las autoinspecciones, calibraciones y calificaciones en los equipos y las validaciones de los procesos que corresponden al almacén?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Existen contratos con empresas proveedoras de servicio de almacenamiento debidamente autorizadas por DIGEMID?', severidad: 'mayor' },
        { ref: 'f', texto: '¿Se establecen y aplican procedimientos de autoinspección?', severidad: 'mayor' },
        { ref: 'f', texto: '¿La autoinspección se realiza con una frecuencia mínima anual o siempre que se detecte cualquier deficiencia o necesidad de acción correctiva?', severidad: 'mayor' },
        { ref: 'g', texto: '¿Los procesos de la cadena de suministro son trazables?', severidad: 'mayor' },
        { ref: 'g', texto: '¿La información está disponible a la DIGEMID?', severidad: 'mayor' },
        { ref: 'h', texto: '¿Existen productos contaminados, adulterados, falsificados, alterados, expirados, en mal estado de conservación u otras observaciones sanitarias fuera del área de baja o devoluciones?', severidad: 'mayor' },
        { ref: 'i', texto: '¿Cuenta con un Manual de Calidad vigente, autorizado por los directivos de mayor nivel organizacional?', severidad: 'mayor' },
        { ref: 'j', texto: '¿Se dispone de Organigrama actualizado?', severidad: 'mayor' },
      ] },
      { seccion: 'PERSONAL', items: [
        { ref: 'a', texto: '¿El D.T. cumple y hace cumplir lo establecido en el Manual de BPA y demás normas sanitarias relacionadas?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Se tiene una relación actualizada de todo el personal que labora en el almacén?', severidad: 'menor' },
        { ref: 'b', texto: '¿Cuenta con número necesario de personal?', severidad: 'menor' },
        { ref: 'b', texto: '¿El personal cuenta con un ambiente confortable de trabajo?', severidad: 'mayor' },
        { ref: 'c', texto: '¿Las funciones y responsabilidades específicas del personal están definidas, son comprendidas y difundidas?', severidad: 'mayor' },
        { ref: 'c', texto: '¿Se cumple con el programa anual de capacitación al personal?', severidad: 'mayor' },
        { ref: 'c', texto: '¿El personal conoce, comprende y aplica los principios que rigen las BPA relacionadas con su trabajo?', severidad: 'mayor' },
        { ref: 'd', texto: 'Se cuenta con registro de capacitación permanente del:', severidad: '' },
        { ref: 'd', texto: '- Director Técnico', severidad: 'mayor' },
        { ref: 'd', texto: '- Q.F. Asistente', severidad: 'mayor' },
        { ref: 'd', texto: '- Personal que labora en el almacén', severidad: 'mayor' },
        { ref: 'd', texto: '¿Se evalúa la capacitación al personal? ¿Se registra?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Se provee al personal de vestimenta adecuada según el tipo de trabajo a realizar?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Se provee al personal de implementos de seguridad?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Cuáles?', severidad: 'informativo' },
        { ref: 'f', texto: '¿El personal recibe inducción, incluyendo instrucciones de Seguridad Industrial e Higiene, de acuerdo a las funciones asignadas? ¿Se registra?', severidad: 'mayor' },
        { ref: 'g', texto: 'Se realiza exámenes médicos y/o de laboratorios antes de ser contratados y periódicos al año?', severidad: 'mayor' },
        { ref: 'g', texto: '- ¿Cuáles?', severidad: '' },
        { ref: 'g', texto: '- Establecimiento de Salud:', severidad: '' },
        { ref: 'g', texto: '- Frecuencia:', severidad: '' },
        { ref: 'g', texto: '- ¿Se documenta?', severidad: '' },
      ] },
      { seccion: 'INSTALACIONES, EQUIPOS E INSTRUMENTOS', items: [
        { ref: 'a', texto: 'El almacén está ubicado dentro de:', severidad: '' },
        { ref: 'a', texto: '- Mercado de abastos', severidad: 'critico' },
        { ref: 'a', texto: '- Campos feriales', severidad: 'critico' },
        { ref: 'a', texto: '- Ferias', severidad: 'critico' },
        { ref: 'a', texto: '- Grifos', severidad: 'critico' },
        { ref: 'a', texto: '- Predios destinados a casa habitación', severidad: 'critico' },
        { ref: 'a', texto: '- Galerías Comerciales', severidad: 'critico' },
        { ref: 'a', texto: '- Clínicas', severidad: 'critico' },
        { ref: 'a', texto: '- Consultorios profesionales de salud', severidad: 'critico' },
        { ref: 'b', texto: '¿Las instalaciones se han ubicado, diseñado, construido, adaptado y mantenido de acuerdo con las operaciones del sistema de almacenamiento?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Se mantienen limpias las zonas adyacentes del almacén?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Está ubicado lejos de fuentes de contaminación?', severidad: 'mayor' },
        { ref: 'c', texto: '¿El almacén está debidamente identificado?', severidad: 'menor' },
        { ref: 'd', texto: 'El Establecimiento cuenta con:', severidad: '' },
        { ref: 'd', texto: '- Almacén', severidad: 'critico' },
        { ref: 'd', texto: '- Oficina Administrativa', severidad: '' },
        { ref: 'd', texto: '- Área administrativa, cuando corresponda', severidad: 'mayor' },
        { ref: 'e', texto: '¿Las vías de acceso al almacén permiten un traslado seguro de los productos?', severidad: 'mayor' },
        { ref: 'f', texto: '¿Las actividades operativas del almacén son interferidas por las actividades administrativas del establecimiento?', severidad: 'mayor' },
        { ref: 'g', texto: '¿Cuenta con área auxiliares (servicios sanitarios y vestuarios)?', severidad: 'mayor' },
        { ref: 'g', texto: 'Se encuentran ubicados fuera del almacén:', severidad: 'mayor' },
        { ref: 'g', texto: '- Los servicios higiénicos', severidad: 'mayor' },
        { ref: 'g', texto: '- Vestidores', severidad: 'mayor' },
        { ref: 'g', texto: '- Comedor', severidad: 'mayor' },
        { ref: 'g', texto: '- Lavaderos y materiales de limpieza', severidad: 'mayor' },
        { ref: 'g', texto: '¿Cuenta con servicio de agua potable en condiciones adecuadas?', severidad: 'mayor' },
        { ref: 'g', texto: '¿Las áreas auxiliares están identificadas, limpias, en buen estado y adecuadamente ventiladas?', severidad: 'mayor' },
        { ref: 'g', texto: '¿Los servicios higiénicos cuentan con implementos de aseo necesarios?', severidad: 'menor' },
        { ref: 'h', texto: '¿Cuenta con espacios de carga/descarga, cuando corresponda?', severidad: 'informativo' },
        { ref: 'h', texto: '¿El área de carga/descarga se encuentra protegida de las condiciones climáticas adversas y otros?', severidad: 'mayor' },
        { ref: 'h', texto: '¿Se prioriza la transferencia de los productos controlados al área correspondiente dentro del almacén? ¿Se registra fecha y hora?', severidad: 'mayor' },
        { ref: 'i', texto: 'El almacén permite:', severidad: '' },
        { ref: 'i', texto: '- El flujo óptimo de las operaciones', severidad: 'mayor' },
        { ref: 'i', texto: '- Seguridad', severidad: 'mayor' },
        { ref: 'i', texto: 'El diseño de las áreas del almacén está de acuerdo a:', severidad: '' },
        { ref: 'i', texto: '- Frecuencia de adquisición y/o abastecimiento', severidad: 'mayor' },
        { ref: 'i', texto: '- Rotación de productos', severidad: 'mayor' },
        { ref: 'i', texto: '- Volumen útil según cantidad de productos a almacenar', severidad: 'mayor' },
        { ref: 'i', texto: '- Las condiciones de almacenamiento requeridas por el producto', severidad: 'critico' },
        { ref: 'i', texto: '¿El flujo del almacén es interferido por alguna actividad operativa o administrativa?', severidad: 'mayor' },
        { ref: 'j', texto: '¿Cuenta con procedimientos operativos escritos sobre la frecuencia y métodos usados en la limpieza?', severidad: 'mayor' },
        { ref: 'j', texto: '¿Se encuentran en buen estado de mantenimiento y limpios:', severidad: '' },
        { ref: 'j', texto: '- Estantes, racks o anaqueles, parihuelas', severidad: 'mayor' },
        { ref: 'j', texto: '- Pisos', severidad: 'mayor' },
        { ref: 'j', texto: '- Paredes', severidad: 'mayor' },
        { ref: 'j', texto: '- Techos', severidad: 'mayor' },
        { ref: 'j', texto: '- Ventanas', severidad: 'mayor' },
        { ref: 'j', texto: '- Otros', severidad: 'mayor' },
        { ref: 'j', texto: '- ¿Se registra?', severidad: 'mayor' },
        { ref: 'k', texto: '¿Existen rótulos que restringen el acceso al almacén sólo a personas autorizadas?', severidad: 'mayor' },
        { ref: 'k', texto: '¿Existen rótulos prohibiendo comer, beber, fumar dentro del almacén?', severidad: 'mayor' },
        { ref: 'k', texto: '¿Cuenta con ascensor, montacargas u otro medio para el traslado de productos a partir del tercer piso?', severidad: 'mayor' },
        { ref: 'k', texto: '¿El personal es capacitado en el uso de montacargas y está autorizado para utilizarlo?, cuando corresponda.', severidad: 'mayor' },
        { ref: 'l', texto: '¿Cuenta con programa de saneamiento ambiental?', severidad: 'mayor' },
        { ref: 'l', texto: '- ¿Con qué frecuencia lo hacen?', severidad: 'informativo' },
        { ref: 'l', texto: '- ¿Se registra?', severidad: 'mayor' },
        { ref: 'm', texto: '¿Los conductos de aire, gas, electricidad, aire acondicionado y otros, están debidamente protegidos?', severidad: 'mayor' },
        { ref: 'm', texto: 'De contar con drenajes ¿Están debidamente protegidos?', severidad: 'mayor' },
        { ref: 'n', texto: '¿Cuenta con instalaciones eléctricas en buenas condiciones?', severidad: 'mayor' },
        { ref: 'n', texto: '¿Hay una adecuada iluminación?', severidad: 'mayor' },
        { ref: 'n', texto: '- Es artificial?', severidad: 'informativo' },
        { ref: 'n', texto: '- Es natural?', severidad: 'informativo' },
        { ref: 'o', texto: '¿Las ventanas están localizadas con protección para evitar el ingreso de polvo, insectos, roedores, aves u otros agentes contaminantes?', severidad: 'mayor' },
        { ref: 'o', texto: '¿De existir ventanas en el almacén, éstas impiden el ingreso directo de la luz solar?', severidad: 'mayor' },
        { ref: 'o', texto: '¿Hay una adecuada circulación interna de aire?', severidad: 'mayor' },
        { ref: 'o', texto: '- Es artificial?', severidad: 'informativo' },
        { ref: 'o', texto: '- Es natural?', severidad: 'informativo' },
        { ref: 'o', texto: '¿Los equipos de ventilación están operativos y en buen funcionamiento y en el caso de cámaras de frío u otros utilizados en el almacén para productos termosensibles, están debidamente calificados?', severidad: 'mayor' },
        { ref: 'p', texto: '¿La humedad relativa en el almacén se encuentra de acuerdo a las condiciones declaradas por el fabricante de los productos?', severidad: 'mayor' },
        { ref: 'q', texto: '¿El almacén cuenta con grupo electrógeno o sistema que lo sustituya a fin de mantener las condiciones de almacenamiento en caso de corte de fluido eléctrico?, cuando corresponda.', severidad: 'mayor' },
        { ref: 'q', texto: '¿Se registran los incidentes que afectan al control de la temperatura y las acciones tomadas durante el corte de fluido eléctrico, se registra e informa estas desviaciones de temperatura?', severidad: 'menor' },
        { ref: 'q', texto: '¿Cuentan con plan de contingencia?', severidad: 'mayor' },
        { ref: 'r', texto: '¿Las paredes son resistentes, lisas y fáciles de limpiar?', severidad: 'mayor' },
        { ref: 'r', texto: '¿Los pisos son de superficie lisa, de fácil limpieza y lo suficientemente nivelados y resistentes para el transporte de los productos que se comercializan?', severidad: 'mayor' },
        { ref: 'r', texto: '¿El material del techo evita la acumulación de calor en el interior del almacén?', severidad: 'mayor' },
        { ref: 'r', texto: '¿De qué material es?', severidad: 'informativo' },
        { ref: 's', texto: '¿El diseño de la puerta brinda seguridad a los productos y equipos?', severidad: 'mayor' },
        { ref: 's', texto: '¿El diseño de la puerta facilita el tránsito de personal, de los productos y equipos?', severidad: 'mayor' },
        { ref: 't', texto: '¿Cuenta con vigilancia permanente y dispositivos de alarma?', severidad: 'menor' },
        { ref: 'u', texto: 'MOBILIARIO, EQUIPOS Y RECURSO MATERIALES', severidad: '' },
        { ref: 'u', texto: 'Cuentan si se requiere con:', severidad: '' },
        { ref: 'u', texto: '- Montacargas', severidad: 'mayor' },
        { ref: 'u', texto: '- Termohigrómetro calibrado', severidad: 'mayor' },
        { ref: 'u', texto: '- Ventilador', severidad: 'mayor' },
        { ref: 'u', texto: '- Balanza calibrada', severidad: 'mayor' },
        { ref: 'u', texto: '- Equipo de aire acondicionado', severidad: 'mayor' },
        { ref: 'u', texto: '- Equipo de extracción de aire', severidad: 'mayor' },
        { ref: 'u', texto: '- Equipo electrógeno u otro sistema alternativo', severidad: 'mayor' },
        { ref: 'u', texto: '- Botiquín', severidad: 'mayor' },
        { ref: 'u', texto: '- Materiales de limpieza', severidad: 'mayor' },
        { ref: 'u', texto: '- Otros:', severidad: 'informativo' },
        { ref: 'v', texto: '¿Existe un procedimiento y programa de calibración y/o calificación de instrumentos y equipos utilizados en el almacén?', severidad: 'mayor' },
        { ref: 'v', texto: '¿Cuentan con programas de mantenimiento de instalaciones y equipos?', severidad: 'mayor' },
        { ref: 'v', texto: '¿Se registra?', severidad: 'mayor' },
        { ref: 'w', texto: '¿La distancia entre la pared y los anaqueles y/o parihuelas, permite realizar la limpieza?', severidad: 'mayor' },
        { ref: 'w', texto: '¿Hay productos colocados directamente sobre el piso?', severidad: 'mayor' },
        { ref: 'w', texto: '¿Los productos se encuentran debidamente ordenados e identificados?', severidad: 'mayor' },
        { ref: 'w', texto: '¿La distancia entre los anaqueles, estantes y/o parihuelas, facilita el manejo de los productos?', severidad: 'mayor' },
        { ref: 'x', texto: '¿Cuenta con extintores suficientes y con carga vigente?', severidad: 'mayor' },
        { ref: 'x', texto: '- ¿Se encuentra despejado el acceso a los extintores?', severidad: 'menor' },
        { ref: 'x', texto: '- ¿El personal es adiestrado en su uso, se registra y/o documenta?', severidad: 'mayor' },
        { ref: 'x', texto: '- ¿Cuenta con detectores de humo?', severidad: 'menor' },
        { ref: 'x', texto: '¿Cuenta con normas de seguridad personal?', severidad: 'mayor' },
      ] },
      { seccion: 'ALMACÉN', items: [
        { ref: 'a', texto: 'El almacén cuenta con las siguientes áreas debidamente separadas, delimitadas e identificadas:', severidad: '' },
        { ref: 'a', texto: '- Recepción', severidad: 'mayor' },
        { ref: 'a', texto: '- Muestras de retención o contramuestras, cuando corresponda', severidad: 'mayor' },
        { ref: 'a', texto: '- Cuarentena/Aprobados/Almacenamiento', severidad: 'mayor' },
        { ref: 'a', texto: '- Bajas/rechazados', severidad: 'mayor' },
        { ref: 'a', texto: '- Devoluciones', severidad: 'mayor' },
        { ref: 'a', texto: '- Embalaje', severidad: 'mayor' },
        { ref: 'a', texto: '- Despacho', severidad: 'mayor' },
        { ref: 'a', texto: '- Productos controlados, cuando corresponda', severidad: 'mayor' },
        { ref: 'a', texto: '- Área administrativa, cuando el almacén se encuentre en lugar distinto a la oficina administrativa.', severidad: 'mayor' },
        { ref: 'a', texto: '- Servicios higiénicos', severidad: 'mayor' },
        { ref: 'a', texto: '- Vestidores', severidad: 'menor' },
        { ref: 'a', texto: '- Materiales de limpieza', severidad: 'menor' },
      ] },
      { seccion: 'ALMACÉN — ÁREA DE RECEPCIÓN', items: [
        { ref: '', texto: '¿Esta separada, delimitada, identificada y equipada?', severidad: 'mayor' },
        { ref: '', texto: '¿Cuenta con procedimientos operativos escritos para la recepción de los productos?', severidad: 'mayor' },
        { ref: '', texto: '¿Se cumple?', severidad: 'mayor' },
        { ref: '', texto: '¿Cada producto ingresa con su respectiva documentación?', severidad: 'mayor' },
        { ref: '', texto: '¿Se elaboran documentos de recepción considerando la información señalada en el Manual de BPA?', severidad: 'mayor' },
        { ref: '', texto: '¿Realiza la limpieza del embalaje?', severidad: 'menor' },
        { ref: '', texto: '¿Se realiza la revisión del estado del embalaje?', severidad: 'menor' },
        { ref: '', texto: 'En la recepción se verifica como mínimo:', severidad: '' },
        { ref: '', texto: '- Nombre, concentración y forma farmacéutica del producto farmacéutico, dispositivo médico, producto sanitario', severidad: 'mayor' },
        { ref: '', texto: '- Nombre del fabricante', severidad: 'mayor' },
        { ref: '', texto: '- Número de lote, serie, código o modelo', severidad: 'mayor' },
        { ref: '', texto: '- Fecha de vencimiento', severidad: 'mayor' },
        { ref: '', texto: '- Cantidad solicitada y recibida', severidad: 'menor' },
        { ref: '', texto: '- Condiciones de almacenamiento y transporte, incluyendo los datos de monitoreo de temperatura, cuando corresponda.', severidad: 'mayor' },
        { ref: '', texto: '- Nombre y firma de la persona que entrega y de la que recibe', severidad: 'mayor' },
        { ref: '', texto: '¿Se transfieren los productos termo-sensibles al área correspondiente dentro del almacén con prioridad y rapidez?', severidad: 'critico' },
      ] },
      { seccion: 'ALMACÉN — ÁREA PARA MUESTRAS DE RETENCIÓN O CONTRAMUESTRAS', items: [
        { ref: '', texto: '¿Cuenta con un área separada, delimitada, identificada y restringida?, cuando corresponda.', severidad: 'mayor' },
      ] },
      { seccion: 'ALMACÉN — ÁREA DE CUARENTENA/APROBADOS/ALMACENAMIENTO', items: [
        { ref: 'a', texto: '¿Cuenta con un área separada, delimitada e identificada?', severidad: 'mayor' },
        { ref: 'a', texto: '¿Se realiza la verificación del registro de recepción, certificado de análisis o especificaciones técnicas bajo la responsabilidad del D.T.? ¿Se registra?', severidad: '' },
        { ref: 'a', texto: '¿Se realiza la evaluación organoléptica de los productos en base a técnicas de muestreo reconocidas bajo la responsabilidad del D.T.? ¿Se registra?', severidad: '' },
        { ref: 'a', texto: '¿La evaluación incluye la revisión y registro del embalaje, envases mediatos e inmediatos y rotulados?', severidad: '' },
        { ref: 'a', texto: 'De contar con un sistema informático para los productos en cuarentena, ¿éste proporciona condiciones equivalentes de seguridad?', severidad: '' },
        { ref: 'a', texto: 'El acceso al sistema informático ¿es restringido al personal autorizado?', severidad: '' },
        { ref: 'a', texto: 'Cuando es necesario, cuenta con áreas para:', severidad: '' },
        { ref: 'a', texto: '- Productos que requieren condiciones especiales (de temperatura, humedad, luz)', severidad: 'mayor' },
        { ref: 'a', texto: '- Productos que requieren controles especiales (estupefacientes, psicotrópicos, precursores y medicamentos que las contienen)', severidad: 'mayor' },
        { ref: 'a', texto: '¿Los productos que requieren controles especiales se almacenan con las debidas medidas de seguridad?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Está documentada la altura de la estiba, así como la distancia entre ellas?, cuando corresponda.', severidad: 'menor' },
        { ref: 'c', texto: 'El sistema de ubicación de los productos es:', severidad: '' },
        { ref: 'c', texto: '- Fijo', severidad: 'informativo' },
        { ref: 'c', texto: '- Fluido', severidad: 'informativo' },
        { ref: 'c', texto: '- Semifluido', severidad: 'informativo' },
        { ref: 'd', texto: 'La disposición de los productos está hecha en base a:', severidad: '' },
        { ref: 'd', texto: '- Orden alfabético', severidad: 'informativo' },
        { ref: 'd', texto: '- Forma farmacéutica', severidad: 'informativo' },
        { ref: 'd', texto: '- Clase terapéutica', severidad: 'informativo' },
        { ref: 'd', texto: '- Código del producto', severidad: 'informativo' },
        { ref: 'd', texto: '- Caótico', severidad: 'informativo' },
        { ref: 'd', texto: '- Otros', severidad: 'informativo' },
        { ref: 'e', texto: '¿Tiene un registro de existencias que consigne el lote, código o serie y fecha de vencimiento según corresponda, de cada producto?', severidad: 'mayor' },
        { ref: 'e', texto: '- ¿Es manual?', severidad: 'informativo' },
        { ref: 'e', texto: '- ¿Es computarizado?', severidad: 'informativo' },
        { ref: 'e', texto: '- ¿Otro?', severidad: 'informativo' },
        { ref: 'f', texto: '¿Cuenta con procedimientos operativos escritos sobre el control de las existencias mediante inventarios?', severidad: 'mayor' },
        { ref: 'f', texto: '- ¿Se registran los inventarios?', severidad: 'mayor' },
        { ref: 'f', texto: '- Con qué frecuencia se realizan:', severidad: 'informativo' },
        { ref: 'f', texto: '¿Existe un sistema de alerta sobre la existencia de productos con fecha de vencimiento?', severidad: 'mayor' },
        { ref: 'f', texto: '- Tres meses', severidad: 'informativo' },
        { ref: 'f', texto: '- Seis meses:', severidad: 'informativo' },
        { ref: 'f', texto: '- Otros', severidad: 'informativo' },
        { ref: 'f', texto: '¿Cuenta con procedimientos operativos escritos en caso se establezcan diferencias en el inventario?', severidad: 'mayor' },
        { ref: 'g', texto: '¿Se registra la investigación en caso se establezcan diferencias en el inventario, si la hubiera?', severidad: 'mayor' },
        { ref: 'h', texto: 'Cuenta con un sistema informático u otro para el control de inventario, ¿el sistema se encuentra validado?', severidad: 'mayor' },
        { ref: 'i', texto: '¿Los productos almacenados se encuentran asegurados para evitar su caída?', severidad: 'mayor' },
        { ref: 'j', texto: '¿Se realiza el mapeo de temperatura y humedad (cuando corresponda)? ¿Se registra?', severidad: 'mayor' },
        { ref: 'k', texto: 'Los Instrumentos o Equipos para el control de temperatura, ¿se encuentran calibrados?', severidad: 'mayor' },
        { ref: 'l', texto: '¿Se mantienen las condiciones de almacenamiento especificadas por el fabricante?', severidad: 'mayor' },
        { ref: 'l', texto: '¿Cuenta con procedimientos operativos escritos para el almacenamiento, incluyendo las condiciones de almacenamiento?', severidad: 'mayor' },
      ] },
      { seccion: 'ALMACÉN — ÁREA DE BAJA/RECHAZADOS', items: [
        { ref: 'a', texto: '¿Cuenta con un área separada, delimitada, identificada y restringida?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Cuentan con procedimiento operativo escrito para el proceso de baja de productos, incluyendo la destrucción de productos contaminados, expirados, adulterados, entre otros?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Se comunica a la DIGEMID la destrucción de productos?', severidad: 'mayor' },
        { ref: 'b', texto: 'En el caso de almacenes tercerizados, ¿El área de bajas es exclusiva para cada establecimiento?', severidad: 'mayor' },
      ] },
      { seccion: 'ALMACÉN — ÁREA DE DEVOLUCIONES', items: [
        { ref: 'a', texto: '¿Cuenta con un área separada, delimitada e identificada?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Cuenta con procedimientos operativos escritos para el manejo de devoluciones?', severidad: 'mayor' },
        { ref: 'c', texto: '¿Se registran, evalúan y documentan las devoluciones y sus causas?', severidad: 'mayor' },
        { ref: 'd', texto: '¿Se registran los resultados y las medidas adoptadas?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Se almacenan los productos devueltos de acuerdo a sus condiciones de almacenamiento?', severidad: 'mayor' },
      ] },
      { seccion: 'ALMACÉN — ÁREA DE EMBALAJE', items: [
        { ref: 'a', texto: '¿Cuenta con un área separada, delimitada e identificada?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Cuenta con procedimientos operativos escritos para embalaje?', severidad: 'mayor' },
        { ref: 'b', texto: 'Se considera la protección mínima contra:', severidad: '' },
        { ref: 'b', texto: '- Riesgos ambientales y físicos de rutina', severidad: 'mayor' },
        { ref: 'b', texto: 'Se evalúa los factores del embalaje de acuerdo a:', severidad: '' },
        { ref: 'b', texto: '- Tipo de transporte', severidad: 'mayor' },
        { ref: 'b', texto: '- Ubicación geográfica', severidad: 'mayor' },
        { ref: 'b', texto: '- Otros?', severidad: 'menor' },
        { ref: 'c', texto: 'Los componentes del embalaje, utilizados son:', severidad: '' },
        { ref: 'c', texto: '- Cajas térmicas aislantes', severidad: 'informativo' },
        { ref: 'c', texto: '- Refrigerantes', severidad: 'informativo' },
        { ref: 'c', texto: '- Separadores internos, cajas corrugadas, entre otros', severidad: 'informativo' },
        { ref: 'd', texto: '¿Se embala los productos de acuerdo al procedimiento escrito?', severidad: 'mayor' },
        { ref: 'e', texto: '¿El embalaje cuenta con rótulo indicando el manejo e identificación para el transporte y distribución?', severidad: 'mayor' },
        { ref: 'f', texto: '¿De no calificarse el embalaje, se realiza el monitoreo permanente de la temperatura? ¿Se registra?', severidad: 'critico' },
      ] },
      { seccion: 'ALMACÉN — ÁREA DE DESPACHO', items: [
        { ref: 'a', texto: '¿Cuenta con un área separada, delimitada e identificada?', severidad: 'mayor' },
        { ref: 'b', texto: 'En el despacho de productos se verifica y se registra:', severidad: 'mayor' },
        { ref: '', texto: '- Documentación que sustente el despacho', severidad: 'mayor' },
        { ref: '', texto: '- Que los productos a despachar correspondan a lo solicitado', severidad: 'mayor' },
        { ref: '', texto: '- Que el etiquetado del embalaje no se desprenda fácilmente', severidad: 'mayor' },
        { ref: '', texto: '- Que se identifiquen los lotes, series u otros', severidad: 'mayor' },
        { ref: '', texto: '- Que se anexe a cada lote del producto el certificado de análisis o especificaciones técnicas según corresponda', severidad: 'critico' },
        { ref: 'c', texto: '¿Identifican en las facturas, boletas de ventas, tickets, guías de remisión u otros comprobantes autorizados por SUNAT, el número de lote, serie o código que van a cada destinatario, que garantice la trazabilidad del producto?', severidad: 'mayor' },
        { ref: 'd', texto: 'Cuenta con procedimientos operativos escritos para el despacho de productos que incluya:', severidad: 'mayor' },
        { ref: '', texto: 'Rotación de stock y manejo de fechas de vencimiento', severidad: 'mayor' },
        { ref: '', texto: '¿Se despachan los productos de acuerdo al sistema FIFO y/o FEFO?', severidad: 'mayor' },
      ] },
      { seccion: 'DE LA DOCUMENTACIÓN', items: [
        { ref: 'a', texto: '¿Cuenta con los siguientes libros oficiales?:', severidad: '' },
        { ref: 'a', texto: '- De control de estupefacientes, cuando corresponda', severidad: 'mayor' },
        { ref: 'a', texto: '- De control de psicotrópicos, cuando corresponda', severidad: 'mayor' },
        { ref: 'a', texto: '- De ocurrencias', severidad: 'mayor' },
        { ref: 'b', texto: '¿Cuenta con procedimientos operativos escritos para la elaboración, revisión, aprobación, actualización periódica y distribución de documentos?', severidad: 'mayor' },
        { ref: 'c', texto: '¿Están los procedimientos operativos escritos en un lenguaje claro, preciso y libre de expresiones ambiguas para su fácil comprensión por parte del usuario?', severidad: 'mayor' },
        { ref: 'd', texto: '¿Existe un sistema que prevenga el uso accidental de documentos no válidos u obsoletos?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Se archivan los documentos referentes a todas las compras, recepciones, controles y despachos para asegurar la trazabilidad de todos los lotes de los productos, como mínimo un año después de su fecha de vencimiento?', severidad: 'mayor' },
        { ref: 'f', texto: '¿Cuenta con procedimientos escritos que describan el control y monitoreo de las temperaturas de almacenamiento, transporte y distribución?', severidad: 'mayor' },
        { ref: 'f', texto: '¿Cuenta con un procedimiento que describa las acciones que deben seguir en caso de desviaciones de temperatura que incluya las acciones correctivas y preventivas?', severidad: 'mayor' },
        { ref: 'g', texto: '¿Se registran en forma inmediata las actividades realizadas en el almacén?', severidad: 'mayor' },
        { ref: 'h', texto: '¿Cuenta con un listado que permita identificar las firmas del personal y siglas utilizadas?', severidad: 'menor' },
        { ref: 'i', texto: '¿Las modificaciones de los registros son fechadas y firmadas por quién lo realiza?', severidad: 'mayor' },
        { ref: 'i', texto: '¿La modificación realizada permite leer la información original?', severidad: 'mayor' },
        { ref: 'j', texto: 'De contar con sistemas informáticos u otros ¿El sistema se encuentra validado?', severidad: 'critico' },
        { ref: 'j', texto: 'El acceso al sistema informático ¿es restringido al personal autorizado?', severidad: 'mayor' },
        { ref: 'k', texto: 'Las modificaciones y supresiones son realizadas sólo por personal autorizado ¿Se registran?', severidad: 'mayor' },
        { ref: 'l', texto: '¿Se cuenta con procedimientos de cómo proceder ante la pérdida y/o daño total y/o parcial de la documentación vigente?', severidad: 'mayor' },
        { ref: 'l', texto: '¿Cuenta con copias de seguridad para evitar la pérdida accidental de datos?', severidad: 'mayor' },
        { ref: 'm', texto: '¿Cada procedimiento indica como mínimo: título, contenido, nombres y firmas de las personas que lo elaboran, revisan y aprueban, ¿así como la fecha de emisión y validez del mismo?', severidad: 'mayor' },
        { ref: 'm', texto: '¿Cuenta con procedimientos operativos escritos sobre condiciones de almacenamiento? (Temperatura y humedad relativa, etc.)', severidad: 'mayor' },
        { ref: 'm', texto: 'Se controla y registra:', severidad: '' },
        { ref: 'm', texto: '- Temperatura ambiente (considerada hasta 30°C y con excursiones de 32°C)', severidad: 'mayor' },
        { ref: 'm', texto: '- Temperatura ambiente controlada (entre 15°C y 25°C)', severidad: 'mayor' },
        { ref: 'm', texto: '- Lugar seco no exceda de 70% de humedad relativa', severidad: 'mayor' },
      ] },
      { seccion: 'RECLAMOS', items: [
        { ref: 'a', texto: '¿Cuenta con procedimientos operativos escritos para el manejo de reclamos?', severidad: 'mayor' },
        { ref: 'b', texto: 'Comunica a la DIGEMID los reclamos en casos de: - Reacción adversa al medicamento - Incidente adverso - Falsificación - Problemas de calidad', severidad: 'mayor' },
        { ref: 'c', texto: '¿Se registran, evalúan y documenta los reclamos?', severidad: 'mayor' },
        { ref: 'd', texto: '¿Se evalúa periódicamente la incidencia del reclamo y aplican las medidas correctivas?', severidad: 'mayor' },
      ] },
      { seccion: 'RETIRO DEL MERCADO', items: [
        { ref: 'a', texto: '¿Cuenta con procedimientos operativos escritos para el retiro de productos del mercado?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Se almacenan los productos retirados del mercado en el área de baja o en un lugar seguro y separado?', severidad: 'mayor' },
        { ref: 'c', texto: 'Cuando corresponda, ¿Se comunica el hecho a la DIGEMID?', severidad: 'mayor' },
        { ref: 'd', texto: '¿Se redacta un informe del monitoreo del retiro, incluyendo la conciliación de las cantidades distribuidas? ¿Está disponible?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Evalúan y documentan la eficacia del Sistema de Retiro? ¿Está disponible?', severidad: 'mayor' },
      ] },
      { seccion: 'AUTO INSPECCIONES', items: [
        { ref: 'a', texto: '¿Cuenta con un programa anual de autoinspección?', severidad: 'mayor' },
        { ref: 'b', texto: '¿Se realiza las autoinspecciones de acuerdo al programa y se registra?', severidad: 'mayor' },
        { ref: 'c', texto: '¿Hay un procedimiento escrito sobre las autoinspecciones que se efectúan al almacén en forma regular?', severidad: 'mayor' },
        { ref: 'd', texto: '¿El equipo de autoinspección es liderado por el Director Técnico o el responsable de Aseguramiento de la Calidad?', severidad: 'mayor' },
        { ref: 'e', texto: '¿Se realiza el informe y adoptan las medidas correctivas en base a las observaciones detectadas en la autoinspección?', severidad: 'mayor' },
      ] },
      { seccion: 'CONTRATOS PARA EL SERVICIO DE ALMACENAMIENTO', items: [
        { ref: 'a', texto: '¿Existe un contrato escrito que estipule claramente las obligaciones de cada una de las partes?', severidad: 'mayor' },
        { ref: 'a', texto: 'En dicho contrato ¿Se precisa, entre otros, los aspectos relacionados con el almacenamiento y vigencia del contrato?', severidad: 'mayor' },
        { ref: 'b', texto: 'El contratante, ¿realiza auditorías en las instalaciones del contratista y las registra?', severidad: 'mayor' },
        { ref: 'c', texto: 'El contratante ¿Evalúa previamente al tercero que prestará servicios de todo o en parte del contrato celebrado con el contratista, cuando corresponda?', severidad: 'mayor' },
        { ref: 'd', texto: '¿El contratante facilita al contratista la información necesaria para el desarrollo adecuado de todas las operaciones previstas en el contrato?', severidad: 'mayor' },
        { ref: 'e', texto: '¿El contratista cuenta con autorización sanitaria de funcionamiento?', severidad: 'critico' },
        { ref: 'e', texto: '¿El contratista cuenta con certificado de BPA, cuando corresponda?', severidad: 'critico' },
        { ref: 'e', texto: 'El contratante, ¿Cuenta con autorización sanitaria para recibir servicio de terceros para almacenamiento?', severidad: 'critico' },
        { ref: 'f', texto: 'El contratante, ¿Cuenta con los registros de las operaciones realizadas en la fabricación, almacenamiento, control de calidad, distribución y transporte, entre otros?', severidad: 'mayor' },
        { ref: 'g', texto: '¿El contratista comunica a la DIGEMID la culminación del contrato de tercerización de almacenamiento, distribución y transporte?', severidad: 'mayor' },
      ] },
    ];
  }

  /* ----- Acta de inspección: objeto en blanco, hallazgos y formato de intercambio -----
     El sub-programa `autoinspecciones/` no comparte estado con la app: lo único
     que viaja entre los dos es este sobre. Sale vacío (formato predeterminado de
     la droguería) y vuelve lleno, con la misma forma en ambos sentidos. */
  var FORMATO_APP = 'bpa-plus', FORMATO_TIPO = 'acta-inspeccion', FORMATO_V = 1;

  var ACTA_CAMPOS = ['numActa', 'fecha', 'auditor', 'almacen', 'ruc', 'rdAutorizacion', 'planos',
    'clientesProveedores', 'productos', 'poeVerificados', 'resultadosPrevios', 'area',
    'checklist', 'respuestas', 'observAdicionales', 'conclusiones', 'medidas', 'completada', 'paso',
    'hall', 'hallCritico', 'hallMayor', 'hallMenor'];

  function actaNueva(dg) {
    dg = dg || {};
    return {
      id: nextId(), e: dg.id || '', numActa: '', fecha: isoHoy(), auditor: dg.dt || '',
      almacen: dg.nombre || '', ruc: dg.ruc || '', rdAutorizacion: '', planos: '',
      clientesProveedores: '', productos: '', poeVerificados: '', resultadosPrevios: '',
      area: 'Almacén general', checklist: checklistOficial(), respuestas: {},
      observAdicionales: '', conclusiones: '', medidas: '', completada: false, paso: 0
    };
  }

  function hallazgos(acta) {
    var checklist = acta.checklist || checklistOficial(), resp = acta.respuestas || {};
    var total = checklist.reduce(function (n, s) { return n + s.items.length; }, 0);
    function sevOf(key) {
      var p = String(key).split('::'), sec = checklist.filter(function (s) { return s.seccion === p[0]; })[0];
      var it = sec && sec.items[+p[1]];
      return it ? it.severidad : '';
    }
    var keys = Object.keys(resp);
    var no = keys.filter(function (k) { return resp[k].v === 'no'; });
    var si = keys.filter(function (k) { return resp[k].v === 'si'; }).length;
    function cuenta(sev) { return no.filter(function (k) { return sevOf(k) === sev; }).length; }
    var critico = cuenta('critico'), mayor = cuenta('mayor'), evaluados = si + no.length;
    return {
      critico: critico, mayor: mayor, menor: cuenta('menor'), abiertos: critico + mayor,
      si: si, no: no.length, evaluados: evaluados, total: total,
      pct: evaluados ? Math.round(si / evaluados * 100) : 0,
      completada: total > 0 && evaluados >= total
    };
  }

  /* Escribe el recuento en el acta: es lo que la lista, el tablero y el acta impresa leen. */
  function aplicarHallazgos(acta) {
    var h = hallazgos(acta);
    acta.hallCritico = h.critico; acta.hallMayor = h.mayor; acta.hallMenor = h.menor;
    acta.hall = h.abiertos; acta.completada = h.completada;
    return h;
  }

  function formatoActa(dg, acta) {
    dg = dg || {};
    var a = acta || actaNueva(dg), out = {};
    ACTA_CAMPOS.forEach(function (k) { if (a[k] !== undefined) out[k] = a[k]; });
    return {
      app: FORMATO_APP, tipo: FORMATO_TIPO, v: FORMATO_V, generado: isoHoy(),
      drogueria: { id: dg.id || '', nombre: dg.nombre || '', ruc: dg.ruc || '', direccion: dg.direccion || '', dt: dg.dt || '', formatos: dg.formatos || [] },
      acta: out
    };
  }

  /* Viene de un archivo: se valida y se limpia antes de tocar nada. Tira Error con
     el motivo para que quien llame lo muestre tal cual. */
  function leerActa(obj) {
    if (!obj || obj.app !== FORMATO_APP || obj.tipo !== FORMATO_TIPO) throw new Error('No es un formato de acta de BPA-Plus.');
    if (!obj.acta || !Array.isArray(obj.acta.checklist) || !obj.acta.checklist.length) throw new Error('El archivo no trae el checklist del acta.');
    var dg = obj.drogueria || {};
    var acta = Object.assign(actaNueva(dg), obj.acta, { id: nextId(), e: dg.id || '' });
    var limpio = {};
    Object.keys(acta.respuestas || {}).forEach(function (k) {
      var r = acta.respuestas[k];
      if (r && (r.v === 'si' || r.v === 'no')) limpio[k] = { v: r.v, obs: String(r.obs || '') };
    });
    acta.respuestas = limpio;
    aplicarHallazgos(acta);
    return { drogueria: dg, acta: acta };
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.domain = {
    EST: EST, EST_LABEL: EST_LABEL, VENTANA_POR_VENCER: VENTANA_POR_VENCER,
    CRITERIOS_DEFAULT: CRITERIOS_DEFAULT, MISC_LABEL: MISC_LABEL,
    dias: dias, hoyLocal: hoyLocal, isoLocal: isoLocal, isoHoy: isoHoy, isoDesdeHoy: isoDesdeHoy,
    fLocal: fLocal, fLarga: fLarga, fDias: fDias,
    edoc: edoc, ecap: ecap,
    normTxt: normTxt, stemTxt: stemTxt,
    clasificarPorCriterio: clasificarPorCriterio, numeroEnNombre: numeroEnNombre,
    scoreCumplimiento: scoreCumplimiento, nextId: nextId, checklistOficial: checklistOficial, SEV_LABEL: SEV_LABEL,
    actaNueva: actaNueva, hallazgos: hallazgos, aplicarHallazgos: aplicarHallazgos,
    formatoActa: formatoActa, leerActa: leerActa
  };
})(window);
