/* ============================================================
   sync.js — Synchronisation automatique multi-appareils.
   Principe : le snapshot complet (Store.exportData) est poussé vers
   Firebase Realtime Database (nœud {folder}/state) et chaque appareil
   le récupère (rappel 10 s + au chargement).

   Nœud distant  : { v: horodatage, src: id client, data: snapshot }
   - « v » = Date.now() du dernier écrit : le plus récent gagne (LWW).
   - « src » évite de réimporter son propre écrit (écho).
   - « data » = sortie de Store.exportData() (idem sauvegarde locale),
     réappliquée via Store.importData().

   DB put/add/del/clear → Sync.changed() déclenche un push (débouncé
   1,5 s). Aucun push pendant une importation (garde applying), aucun
   push avant la fin du premier tirage (garde bootstrap : évite que le
   snapshot vide du démarrage écrase des données distantes plus récentes).
   Nécessite règles RTDB ouvertes en lecture/écriture + config dans
   js/firebase-config.js.
   ============================================================ */
window.Sync = (function () {
  var cfg = null;
  var stateUrl = null;
  var dirty = false;
  var pushTimer = null;
  var applying = false;
  var pushing = false;
  var intervalId = null;
  var ready = false;
  var bootstrap = true;
  var lastV = 0;
  var VKEY = 'gs_sync_v';
  var CID = window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : (Math.random().toString(36).slice(2) + Date.now().toString(36));

  function enabled() {
    return !!(cfg && cfg.enabled && cfg.databaseURL && cfg.syncFolder && window.fetch);
  }

  function enc(s) {
    return encodeURIComponent(String(s));
  }

  function now() {
    return Date.now();
  }

  function applyV(v) {
    lastV = v;
    try { localStorage.setItem(VKEY, String(v)); } catch (e) { /* ignore */ }
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function changed() {
    if (!enabled() || applying) return;
    dirty = true;
    if (bootstrap) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }

  function flush() {
    if (bootstrap) return;
    if (dirty && !pushTimer) pushTimer = setTimeout(push, 1500);
  }

  function push() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (!enabled() || !dirty || applying || pushing) return;
    dirty = false;
    pushing = true;
    return Store.exportData().then(function (data) {
      var v = now();
      var payload = { v: v, src: CID, data: data };
      return fetch(stateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        applyV(v);
        UI && UI.toast && UI.toast('Données enregistrées dans le cloud.', 'ok');
      });
    }).catch(function (e) {
      dirty = true;
      console.warn('Sync push impossible :', e);
    }).then(function () {
      pushing = false;
      flush();
    });
  }

  function applySnapshot(snap) {
    applying = true;
    return Store.importData(snap.data).then(function () {
      applyV(snap.v || now());
      try {
        DB.openSchool(DB.name());
        return DB.ready();
      } catch (e) { return Promise.resolve(); }
    }).finally(function () {
      applying = false;
    }).then(function () {
      UI && UI.toast && UI.toast('Données synchronisées depuis le cloud.', 'ok');
      try {
        if (window.App && App.refreshBranding) App.refreshBranding();
      } catch (e) { /* ignore */ }
    });
  }

  function pull() {
    if (!enabled() || applying) return Promise.resolve();
    return fetchJson(stateUrl).then(function (snap) {
      if (!snap || !snap.data || snap.src === CID) return;
      if ((snap.v || 0) <= lastV) return;
      return applySnapshot(snap);
    }).catch(function (e) {
      if (e && e.message && e.message.indexOf('401') >= 0) console.warn('Sync : authentification requise (modifiez les règles RTDB).');
    }).then(function () {
      if (bootstrap) { bootstrap = false; flush(); }
    });
  }

  function start() {
    if (!enabled() || ready) return;
    cfg = window.FIREBASE_CONFIG || null;
    if (!cfg.enabled) { console.info('Sync désactivé : FIREBASE_CONFIG.enabled = false.'); ready = true; return; }
    stateUrl = String(cfg.databaseURL).replace(/\/+$/, '') + '/' + enc(cfg.syncFolder) + '/state.json';
    try { lastV = Number(localStorage.getItem(VKEY)) || 0; } catch (e) { lastV = 0; }
    ready = true;
    pull().then(function () { intervalId = setInterval(pull, 10000); });
    window.addEventListener('online', pull);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.FIREBASE_CONFIG) cfg = window.FIREBASE_CONFIG;
    start();
  });

  return {
    enabled: enabled,
    changed: changed,
    pull: pull,
    start: start,
    get stateUrl() { return stateUrl; },
    get ready() { return ready; }
  };
})();