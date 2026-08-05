/* Inicio de sesión real con Firebase Auth. El PIN sigue protegiendo el dispositivo. */
(function (global) {
  'use strict';

  var Cloud = global.BPAPLUS.cloud, currentUser = null, screen;

  function message(err) {
    var code = err && err.code || '';
    if (code.indexOf('invalid-credential') >= 0 || code.indexOf('wrong-password') >= 0 || code.indexOf('user-not-found') >= 0) return 'Correo o contraseña incorrectos.';
    if (code.indexOf('email-already-in-use') >= 0) return 'Ese correo ya tiene una cuenta.';
    if (code.indexOf('weak-password') >= 0) return 'Usa una contraseña de al menos 6 caracteres.';
    if (code.indexOf('invalid-email') >= 0) return 'Escribe un correo válido.';
    if (code.indexOf('network-request-failed') >= 0) return 'Sin conexión. Conéctate para iniciar sesión por primera vez.';
    if (code.indexOf('operation-not-allowed') >= 0) return 'El acceso por correo aún no está habilitado en Firebase.';
    return (err && err.message) || 'No se pudo iniciar sesión.';
  }

  function removeScreen() { if (screen) screen.remove(); screen = null; }
  function showLogin() {
    if (screen) return;
    screen = document.createElement('div'); screen.className = 'authscreen';
    screen.innerHTML = '<form class="auth-card" id="authForm">' +
      '<img class="auth-logo" src="icons/icon-192.png" alt="">' +
      '<h1>BPA-Plus</h1><p class="auth-lead">Tus registros BPA, sincronizados y protegidos.</p>' +
      '<label>Correo electrónico<input class="auth-input" id="authEmail" type="email" autocomplete="email" required></label>' +
      '<label>Contraseña<input class="auth-input" id="authPassword" type="password" autocomplete="current-password" minlength="6" required></label>' +
      '<div class="auth-error" id="authError" role="alert"></div>' +
      '<button class="auth-primary" id="authLogin" type="submit">Iniciar sesión</button>' +
      '<button class="auth-secondary" id="authCreate" type="button">Crear mi cuenta</button>' +
      '<button class="auth-link" id="authReset" type="button">Olvidé mi contraseña</button>' +
      '<p class="auth-note">Después del acceso se pedirá el PIN de este dispositivo.</p></form>';
    document.body.appendChild(screen);

    var form = document.getElementById('authForm'), email = document.getElementById('authEmail');
    var password = document.getElementById('authPassword'), error = document.getElementById('authError');
    function busy(on) { form.querySelectorAll('button').forEach(function (b) { b.disabled = on; }); }
    function values() { error.textContent = ''; if (!form.reportValidity()) return null; return [email.value.trim(), password.value]; }
    function run(action) {
      var v = values(); if (!v) return;
      busy(true); action(Cloud.getAuth(), v[0], v[1]).catch(function (err) { error.textContent = message(err); busy(false); });
    }
    form.onsubmit = function (e) { e.preventDefault(); run(Cloud.api().signInWithEmailAndPassword); };
    document.getElementById('authCreate').onclick = function () { run(Cloud.api().createUserWithEmailAndPassword); };
    document.getElementById('authReset').onclick = function () {
      var address = email.value.trim();
      if (!address) { error.textContent = 'Escribe primero tu correo.'; email.focus(); return; }
      busy(true);
      Cloud.api().sendPasswordResetEmail(Cloud.getAuth(), address).then(function () {
        error.className = 'auth-error ok'; error.textContent = 'Te enviamos un enlace para restablecerla.'; busy(false);
      }).catch(function (err) { error.textContent = message(err); busy(false); });
    };
    setTimeout(function () { email.focus(); }, 0);
  }

  function gate(next) {
    Cloud.init().then(function () {
      var started = false;
      Cloud.api().onAuthStateChanged(Cloud.getAuth(), function (user) {
        currentUser = user || null;
        Cloud.setUid(user && user.uid);
        if (!user) { started = false; showLogin(); return; }
        removeScreen();
        if (!started) { started = true; next(); }
      });
    }).catch(function (err) {
      showLogin();
      document.getElementById('authError').textContent = message(err);
      document.getElementById('authForm').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    });
  }

  function signOut() { return Cloud.api().signOut(Cloud.getAuth()); }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.auth = { gate: gate, signOut: signOut, current: function () { return currentUser; } };
})(window);
