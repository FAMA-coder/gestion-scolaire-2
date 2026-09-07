/* ============================================================
   js/install.js — Bouton d'installation PWA
   Affiche un bouton "Installer l'application" dès que le
   navigateur autorise l'installation (événement
   `beforeinstallprompt`), puis déclenche la boîte native.
   Une fois l'application installée, le drapeau gs_app_installed
   est conservé en localStorage : l'install ne peut plus être
   proposée ni déclenchée à nouveau (ni sur ce poste, ni dans
   toute autre fenêtre/onglet du même navigateur).
   ============================================================ */
(function () {
  var button = document.getElementById('install-btn');
  if (!button) return;

  var KEY = 'gs_app_installed';
  var deferredPrompt = null;

  function readInstalled() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markInstalled() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
  }

  // Déjà installé (mode autonome) ou marqué installé : ne plus jamais proposer.
  if (readInstalled() ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
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
    // Empêche l'invite automatique du navigateur.
    e.preventDefault();
    if (readInstalled()) return; // installé : plus aucune propose.
    // Conserve l'événement pour le déclencher manuellement depuis le bouton.
    deferredPrompt = e;
    show();
  });

  button.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      deferredPrompt = null;
      if (choice && choice.outcome === 'accepted') markInstalled();
      hide();
    });
  });

  // L'application a été installée : on fige le drapeau définitivement.
  window.addEventListener('appinstalled', function () {
    markInstalled();
    hide();
  });
})();