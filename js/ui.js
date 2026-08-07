/* ==========================================================================
   BPA-Plus — ui.js
   Kit de componentes sin dependencias externas: iconos, notas (toasts),
   diálogos, panel lateral, hoja de acciones (móvil), confirmaciones.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain;

  /* ------------------------------ Iconos (trazo, 2px) ------------------------------ */
  var ICONS = {
    beacon: '<path d="M12 2v4"/><path d="M8 6h8l2 6H6l2-6z"/><path d="M5 22h14l-1.5-8h-11L5 22z"/><path d="M9.5 14h5"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>',
    insp: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 8l5-5 5 5"/><path d="M12 3v12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M2 22h20M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    flag: '<path d="M5 22V4"/><path d="M5 4h13l-3 5 3 5H5"/>'
  };
  function icon(name, size, cls) {
    var p = ICONS[name] || ''; size = size || 20;
    return '<svg class="' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Etiqueta de estado en forma de banderín (pennant tag) */
  function tag(est, label) {
    var l = label || D.EST_LABEL[est] || est;
    return '<span class="tag ' + est + '"><i></i>' + esc(l) + '</span>';
  }

  function haptic(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) {} } }

  /* ------------------------------ Nota (toast) ------------------------------ */
  var noteWrap;
  function ensureNoteWrap() {
    if (!noteWrap) { noteWrap = document.createElement('div'); noteWrap.className = 'note-stack'; document.body.appendChild(noteWrap); }
    return noteWrap;
  }
  function note(msg, opts) {
    opts = opts || {};
    var w = ensureNoteWrap();
    var el = document.createElement('div'); el.className = 'note';
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    if (opts.actionLabel) {
      var b = document.createElement('button'); b.className = 'note-act'; b.textContent = opts.actionLabel;
      b.onclick = function () { clearTimeout(t); el.remove(); if (opts.onAction) opts.onAction(); };
      el.appendChild(b);
    }
    w.appendChild(el);
    var t = setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(function () { el.remove(); }, 200); }, opts.duration || (opts.actionLabel ? 5000 : 2600));
    return el;
  }

  /* ------------------------------ Focus trap ------------------------------ */
  function trap(container) {
    function onKey(e) {
      if (e.key !== 'Tab') return;
      var f = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      f = Array.prototype.filter.call(f, function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    container.addEventListener('keydown', onKey);
    return function () { container.removeEventListener('keydown', onKey); };
  }

  /* ------------------------------ Diálogo (modal) ------------------------------ */
  var openStack = [];
  function dialog(opts) {
    var bd = document.createElement('div'); bd.className = 'scrim';
    var wrap = document.createElement('div'); wrap.className = 'dialog'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    var foot = opts.footer != null ? opts.footer : '';
    wrap.innerHTML =
      '<div class="dialog-card ' + (opts.wide ? 'wide' : '') + '">' +
        '<div class="dialog-head"><div class="dialog-title">' + esc(opts.title || '') + '</div>' +
          '<button class="icon-btn" data-close aria-label="Cerrar">' + icon('x', 18) + '</button></div>' +
        '<div class="dialog-body">' + (opts.body || '') + '</div>' +
        (foot ? '<div class="dialog-foot">' + foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(bd); document.body.appendChild(wrap);
    var release = trap(wrap);
    function close(result) {
      release();
      bd.remove(); wrap.remove();
      openStack = openStack.filter(function (x) { return x !== api; });
      if (opts.onClose) opts.onClose(result);
    }
    var api = { root: wrap, close: close, el: wrap.querySelector('.dialog-card') };
    openStack.push(api);
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { close(); return; }
      if (e.target === wrap) {
        var card = wrap.querySelector('.dialog-card');
        card.classList.add('shake');
        setTimeout(function () { card.classList.remove('shake'); }, 320);
      }
    });
    requestAnimationFrame(function () {
      bd.classList.add('show'); wrap.classList.add('show');
      var first = wrap.querySelector('input, select, textarea, button:not([data-close])');
      if (first) first.focus();
    });
    if (opts.onMount) opts.onMount(wrap);
    return api;
  }

  /* ------------------------------ Panel lateral (drawer) ------------------------------ */
  function panel(opts) {
    var bd = document.createElement('div'); bd.className = 'scrim';
    var dw = document.createElement('div'); dw.className = 'panel'; dw.setAttribute('role', 'dialog'); dw.setAttribute('aria-modal', 'true');
    dw.innerHTML =
      '<div class="panel-head"><div class="dialog-title">' + esc(opts.title || '') + '</div>' +
        '<button class="icon-btn" data-close aria-label="Cerrar">' + icon('x', 18) + '</button></div>' +
      '<div class="panel-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="panel-foot">' + opts.footer + '</div>' : '');
    document.body.appendChild(bd); document.body.appendChild(dw);
    var release = trap(dw);
    function close() {
      release(); bd.classList.remove('show'); dw.classList.remove('show');
      setTimeout(function () { bd.remove(); dw.remove(); }, 220);
      openStack = openStack.filter(function (x) { return x !== api; });
      if (opts.onClose) opts.onClose();
    }
    var api = { root: dw, close: close };
    openStack.push(api);
    bd.addEventListener('click', close);
    dw.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    requestAnimationFrame(function () { bd.classList.add('show'); dw.classList.add('show'); });
    if (opts.onMount) opts.onMount(dw);
    return api;
  }

  /* ------------------------------ Hoja de acciones (móvil) ------------------------------ */
  function actionsheet(options) {
    var bd = document.createElement('div'); bd.className = 'scrim';
    var sh = document.createElement('div'); sh.className = 'picker'; sh.setAttribute('role', 'menu');
    sh.innerHTML = '<div class="picker-grip"></div>' + options.map(function (o, i) {
      return '<button class="picker-opt ' + (o.danger ? 'danger' : '') + '" data-i="' + i + '" role="menuitem">' +
        (o.icon ? icon(o.icon, 20) : '') + '<span>' + esc(o.label) + '</span></button>';
    }).join('');
    document.body.appendChild(bd); document.body.appendChild(sh);
    function close() { bd.classList.remove('show'); sh.classList.remove('show'); setTimeout(function () { bd.remove(); sh.remove(); }, 220); }
    bd.addEventListener('click', close);
    sh.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]'); if (!b) return;
      close(); var o = options[+b.dataset.i]; if (o.onClick) o.onClick();
    });
    requestAnimationFrame(function () { bd.classList.add('show'); sh.classList.add('show'); });
  }

  /* ------------------------------ Confirmación ------------------------------ */
  function confirm(opts) {
    return new Promise(function (resolve) {
      var m = dialog({
        title: opts.title || 'Confirmar',
        body: '<p style="margin:0;color:var(--ink-2);font-size:14px;line-height:1.55">' + esc(opts.message || '') + '</p>',
        footer: '<button class="btn btn-ghost" data-no>' + esc(opts.cancelLabel || 'Cancelar') + '</button>' +
                '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-yes>' + esc(opts.okLabel || 'Aceptar') + '</button>',
        onMount: function (root) {
          root.querySelector('[data-yes]').onclick = function () { m.close(true); };
          root.querySelector('[data-no]').onclick = function () { m.close(false); };
        },
        onClose: function (result) { resolve(result === true); }
      });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openStack.length) { openStack[openStack.length - 1].close(); }
  });

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.ui = {
    icon: icon, esc: esc, tag: tag, haptic: haptic,
    note: note, dialog: dialog, panel: panel, actionsheet: actionsheet, confirm: confirm
  };
})(window);
