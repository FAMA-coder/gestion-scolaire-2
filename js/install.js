/* ============================================================
   js/install.js — Bouton d'installation PWA
   Affiche un bouton "Installer l'application" dès que le
   navigateur autorise l'installation (événement
   `beforeinstallprompt`), puis déclenche la boîte native.
   ============================================================ */
(function () {
  var button = document.getElementById('install-btn');
  if (!button) return;

  var deferredPrompt = null;

  // Déjà installé (mode autonome) ? Ne rien afficher.
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    return;
  }

  function show() {
    button.hidden = false;
    button.setAttribute('aria-hidden', 'false');
  }
  function hide() {
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    // Empêche l'invite automatique du navigateur et conserve l'événement
    // pour le déclencher manuellement depuis le bouton.
    e.preventDefault();
    deferredPrompt = e;
    show();
  });

  button.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      deferredPrompt = null;
      hide();
    });
  });

  // L'application a été installée pendant cette session / plus tard.
  window.addEventListener('appinstalled', function () {
    hide();
  });
})();