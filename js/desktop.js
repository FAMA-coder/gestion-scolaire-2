/* ============================================================
   js/desktop.js — Pont vers la coquille de bureau (WebView2).
   Expose un objet global `Desktop` :
     · détection de l'environnement bureau,
     · licence (lecture / activation) signée par l'hôte,
     · configuration d'installation (écoles & comptes),
     · impression (dialogue système via le composant WebView2),
     · fermeture propre de l'application.
   En navigateur web (sans WebView2), toutes ces fonctions sont
   sans effet : l'application fonctionne comme avant.
   ============================================================ */
window.Desktop = (function () {
  var syncHost = null;

  function isDesktop() {
    return !!(window.chrome && window.chrome.webview &&
      window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.desktop);
  }

  // Référence du pont COM injecté par l'hôte. On utilise le proxy
  // SYNCHRONE (hostObjects.sync) : fiable dans WebView2, à l'inverse
  // du proxy asynchrone qui peut résoudre des valeurs vides.
  function getHost() {
    if (syncHost !== null) return syncHost;
    syncHost = undefined;
    try {
      var w = window.chrome && window.chrome.webview && window.chrome.webview.hostObjects;
      if (w && w.sync && w.sync.desktop) syncHost = w.sync.desktop;
    } catch (e) { syncHost = undefined; }
    return syncHost;
  }

  // Interroge le pont (API asynchrone par compatibilité).
  function call(method, arg) {
    var h = getHost();
    if (!h) return Promise.reject(new Error('Environnement bureau indisponible.'));
    try {
      var value = arg === undefined ? h[method]() : h[method](arg);
      return Promise.resolve(value);
    } catch (e) { return Promise.reject(e); }
  }

  async function json(method, arg) {
    var raw = await call(method, arg);
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }

  return {
    isDesktop: isDesktop,
    ready: async function () { return getHost(); },

    ping: async function () { return call('Ping'); },

    // Licence signée (JSON).
    getLicense: async function () { return json('GetLicenseJson'); },
    // Activation par clé de licence : { key } → nouveau JSON de licence.
    activateKey: async function (key) { return json('ActivateKeyJson', JSON.stringify({ key: String(key || '') })); },

    // Configuration d'installation consommée au premier démarrage.
    getConfig: async function () { return json('GetConfigJson'); },
    markConfigProcessed: async function () {
      try { await call('MarkConfigProcessed'); } catch (e) { /* ignore */ }
    },

    getAppVersion: async function () { return call('GetAppVersion'); },
    getInstallDir: async function () { return call('GetInstallDir'); },

    // Renouvellement volontaire : nouveau code d'installation persisté (JSON).
    renewInstallCode: async function () { return json('RenewInstallCodeJson'); },

    // Synchronisation réseau local (coquille) : requête JSON → réponse JSON.
    lanSync: async function (requestJson) { return json('LanSyncRequest', requestJson); },
    lanInfo: async function () { return json('LanInfo'); },

    // Personnalise la configuration réseau local (Paramètres → Synchronisation), à chaud.
    saveLanConfig: async function (configJson) { return json('SaveLanConfigJson', configJson); },

    // Impression : ouvre le dialogue d'impression du composant.
    showPrint: async function () { return call('ShowPrint'); },

    // Journal de diagnostic (écrit par l'hôte dans desktop.log).
    log: function (msg) {
      try { call('Log', String(msg)); } catch (e) { /* ignore */ }
    },

    // Ferme proprement l'application bureau.
    quit: function () {
      if (!isDesktop()) { try { window.close(); } catch (e) { /* ignore */ } return; }
      try { window.chrome.webview.postMessage({ cmd: 'quit' }); } catch (e) { /* ignore */ }
    }
  };
})();