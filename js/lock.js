/* ==========================================================================
   BPA-Plus — lock.js
   Bloqueo con PIN 100% local. No hay servidor: el PIN (salteado y con hash
   SHA-256) se guarda únicamente en este dispositivo vía localStorage. Sirve
   para que, si perdés el celular o alguien lo toma prestado, no entre
   directo a la app.
   ========================================================================== */
(function (global) {
  'use strict';
  var KEY = 'bpa-plus-lock';

  function hasCrypto() { return !!(global.crypto && global.crypto.subtle); }

  function bufToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function randomSalt() {
    var a = new Uint8Array(16); global.crypto.getRandomValues(a);
    return bufToHex(a);
  }
  function hashPin(pin, salt) {
    var data = new TextEncoder().encode(salt + ':' + pin);
    return global.crypto.subtle.digest('SHA-256', data).then(bufToHex);
  }

  function getRecord() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function setRecord(rec) {
    try { if (rec) localStorage.setItem(KEY, JSON.stringify(rec)); else localStorage.removeItem(KEY); } catch (e) {}
  }
  function isEnabled() { return !!getRecord(); }

  function setPin(pin) {
    var salt = randomSalt();
    return hashPin(pin, salt).then(function (hash) { setRecord({ salt: salt, hash: hash }); });
  }
  function clearPin() { setRecord(null); }
  function verify(pin) {
    var rec = getRecord(); if (!rec) return Promise.resolve(true);
    return hashPin(pin, rec.salt).then(function (h) { return h === rec.hash; });
  }

  /* ------------------------------ Pantalla de bloqueo ------------------------------ */
  function showLockScreen(onUnlock, creating) {
    var el = document.createElement('div'); el.className = 'lockscreen';
    el.innerHTML =
      '<div class="lock-mark"><img src="icons/icon-192.png?v=3" alt=""></div>' +
      '<div class="lock-title" id="lockTitle">' + (creating ? 'Crear acceso' : 'Iniciar sesión') + '</div>' +
      '<div class="lock-sub" id="lockSub">' + (creating ? 'Creá un PIN de 4 a 6 dígitos para proteger tus datos' : 'Ingresá tu PIN para continuar') + '</div>' +
      '<div class="lock-dots" id="lockDots"></div>' +
      '<div class="lock-err" id="lockErr">' + (creating ? 'Los PIN no coinciden' : 'PIN incorrecto') + '</div>' +
      '<div class="lock-pad" id="lockPad">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map(function (k) {
          if (k === '') return '<span></span>';
          if (k === 'del') return '<button class="lock-key lock-del" data-k="del" aria-label="Borrar">⌫</button>';
          return '<button class="lock-key" data-k="' + k + '">' + k + '</button>';
        }).join('') +
      '</div>' +
      (creating ? '' : '<button class="lock-reset" id="lockReset" type="button">¿Olvidaste el PIN?</button>');
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';

    var buf = '', firstPin = '', max = 6, dots = el.querySelector('#lockDots'), err = el.querySelector('#lockErr');
    function draw() {
      dots.innerHTML = '';
      var n = Math.max(4, buf.length);
      for (var i = 0; i < n; i++) { var d = document.createElement('span'); d.className = 'lock-dot' + (i < buf.length ? ' filled' : ''); dots.appendChild(d); }
    }
    draw();

    function tryUnlock() {
      if (pending) { clearTimeout(pending); pending = null; }
      err.classList.remove('show');
      if (creating && !firstPin) {
        firstPin = buf; buf = ''; draw();
        el.querySelector('#lockTitle').textContent = 'Confirmar PIN';
        el.querySelector('#lockSub').textContent = 'Ingresá el mismo PIN una vez más';
        return;
      }
      if (creating && buf !== firstPin) {
        err.classList.add('show'); el.classList.add('shake');
        setTimeout(function () { el.classList.remove('shake'); }, 320);
        firstPin = ''; buf = ''; draw();
        el.querySelector('#lockTitle').textContent = 'Crear acceso';
        el.querySelector('#lockSub').textContent = 'Los PIN no coincidieron. Intentá nuevamente';
        return;
      }
      var check = creating ? setPin(buf).then(function () { return true; }) : verify(buf);
      check.then(function (ok) {
        if (ok) {
          document.body.style.overflow = '';
          document.removeEventListener('keydown', onKey);
          el.remove();
          onUnlock();
        } else {
          err.classList.add('show');
          el.classList.add('shake');
          setTimeout(function () { el.classList.remove('shake'); }, 320);
          buf = ''; draw();
        }
      });
    }

    var pending = null;
    function press(k) {
      if (k === 'del') { buf = buf.slice(0, -1); draw(); if (pending) { clearTimeout(pending); pending = null; } return; }
      if (buf.length >= max) return;
      buf += String(k); draw();
      if (pending) clearTimeout(pending);
      if (buf.length === max) { tryUnlock(); }
      else if (buf.length >= 4) { pending = setTimeout(tryUnlock, 550); }
    }
    el.querySelector('#lockPad').addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]'); if (!b) return; press(b.dataset.k);
    });
    var onKey = function (e) {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && buf.length >= 4) tryUnlock();
    };
    document.addEventListener('keydown', onKey);

    var reset = el.querySelector('#lockReset');
    if (reset) reset.onclick = function () {
      if (!global.BPAPLUS.ui) return;
      global.BPAPLUS.ui.confirm({
        title: 'Olvidaste tu PIN',
        message: 'No hay forma de recuperarlo: no se guarda en ningún servidor. La única opción es borrar el bloqueo y todos los datos de esta app en este dispositivo para volver a empezar. ¿Borrar todo y quitar el PIN?',
        okLabel: 'Borrar todo', danger: true
      }).then(function (ok) {
        if (!ok) return;
        clearPin();
        indexedDB.deleteDatabase('bpa-plus');
        location.reload();
      });
    };
  }

  /* ------------------------------ Puerta de entrada ------------------------------ */
  function gate(onReady) {
    if (!hasCrypto()) { onReady(); return; }
    showLockScreen(onReady, !isEnabled());
  }

  /* ------------------------------ Configuración (desde ajustes) ------------------------------ */
  function openSettings() {
    var UI = global.BPAPLUS.ui; if (!UI) return;
    var m = UI.dialog({
      title: 'Cambiar PIN',
      body:
        '<p class="dialog-note">El PIN se guarda solo en este dispositivo. Si lo olvidás, tendrás que borrar los datos locales para volver a entrar.</p>' +
        '<div class="field"><label>Nuevo PIN (4 a 6 dígitos)</label><input class="inp mono" id="lp_new" type="password" inputmode="numeric" maxlength="6" placeholder="Nuevo PIN"></div>' +
        '<div class="field"><label>Confirmar</label><input class="inp mono" id="lp_conf" type="password" inputmode="numeric" maxlength="6" placeholder="Repetí el PIN"></div>' +
        '<div class="err" id="lp_err">Los PIN no coinciden o son muy cortos (mínimo 4 dígitos).</div>',
      footer:
        '<button class="btn btn-ghost" data-close>Cancelar</button>' +
        '<button class="btn btn-primary" id="lp_save">Actualizar PIN</button>',
      onMount: function (root) {
        root.querySelector('#lp_save').onclick = function () {
          var a = root.querySelector('#lp_new').value.trim(), b = root.querySelector('#lp_conf').value.trim();
          if (!/^\d{4,6}$/.test(a) || a !== b) { root.querySelector('#lp_err').style.display = 'block'; return; }
          setPin(a).then(function () { m.close(); UI.note('PIN actualizado'); });
        };
      }
    });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.lock = { isEnabled: isEnabled, setPin: setPin, clearPin: clearPin, verify: verify, gate: gate, openSettings: openSettings };
})(window);
