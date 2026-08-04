/* ==========================================================================
   BPA-Plus — alerts.js
   Panel de alertas dentro de la app (sin notificaciones del navegador):
   junta vencimientos de documentos, capacitaciones y autoinspecciones de
   TODAS las droguerías, no solo la activa, para que no se te pase nada
   por tener el foco en una sola.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, UI = global.BPAPLUS.ui, esc = UI.esc, icon = UI.icon;
  var store, V;

  var WINDOW_DAYS = 30;

  function collect() {
    var byId = {}; store.data.droguerias.forEach(function (e) { byId[e.id] = e; });
    var items = [];

    store.data.documentos.forEach(function (d) {
      var n = D.dias(d.rev);
      if (n <= WINDOW_DAYS) items.push({ kind: 'doc', dg: byId[d.e], obj: d, fecha: d.rev, dias: n, titulo: d.codigo + ' · ' + d.nombre });
    });
    store.data.capacitaciones.forEach(function (c) {
      if (D.ecap(c) === 'realizada') return;
      var n = D.dias(c.fecha);
      if (n <= WINDOW_DAYS) items.push({ kind: 'cap', dg: byId[c.e], obj: c, fecha: c.fecha, dias: n, titulo: c.tema });
    });
    store.data.inspecciones.forEach(function (i) {
      if (i.real) return;
      var n = D.dias(i.prog);
      if (n <= WINDOW_DAYS) items.push({ kind: 'insp', dg: byId[i.e], obj: i, fecha: i.prog, dias: n, titulo: i.area });
    });

    items = items.filter(function (it) { return it.dg; });
    items.sort(function (a, b) { return a.dias - b.dias; });
    return items;
  }

  function count() { return collect().length; }

  var KIND_LABEL = { doc: 'Documento', cap: 'Capacitación', insp: 'Autoinspección' };
  var KIND_ICON = { doc: 'doc', cap: 'cap', insp: 'insp' };

  function open() {
    var items = collect();
    var m = UI.panel({
      title: 'Alertas · todas las droguerías',
      body: items.length ? '<div class="list">' + items.map(function (it, i) {
        var f = D.fDias(it.dias);
        return '<div class="row" data-alert="' + i + '"><div class="row-top" style="cursor:pointer"><div class="chan ' + it.kind + '"></div><div class="row-main">' +
          '<div class="row-code mono">' + esc(it.dg.nombre) + '</div>' +
          '<div class="row-name">' + esc(it.titulo) + '</div>' +
          '<div class="row-meta"><span>' + esc(KIND_LABEL[it.kind]) + '</span></div></div>' +
          '<div class="row-side"><span class="days ' + f.cls + '">' + f.txt + '</span></div></div></div>';
      }).join('') + '</div>' : emptyAlerts(),
      onMount: function (root) {
        root.querySelectorAll('[data-alert]').forEach(function (el) {
          el.onclick = function () {
            var it = items[+el.dataset.alert];
            var sameDg = store.dg().id === it.dg.id;
            m.close();
            if (!sameDg) store.setDg(it.dg.id);
            setTimeout(function () {
              if (it.kind === 'doc') V.panels.docPanel(it.obj);
              else if (it.kind === 'cap') V.panels.capPanel(it.obj);
              else V.panels.inspPanel(it.obj);
            }, sameDg ? 0 : 260);
          };
        });
      }
    });
  }

  function emptyAlerts() {
    return '<div class="empty" style="padding:40px 10px">' + icon('check', 36, 'es-ico') +
      '<span class="es-title">Sin vencimientos próximos</span>' +
      '<span class="es-sub">Nada vence en los próximos ' + WINDOW_DAYS + ' días en ninguna droguería.</span></div>';
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.alerts = {
    setStore: function (s, v) { store = s; V = v; },
    count: count, open: open
  };
})(window);
