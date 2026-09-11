/* ============================================================
   js/lan.js — Synchronisation temps réel entre postes
   du réseau local (coquille de bureau, transport TCP).
   Même principe que js/sync.js (snapshot LWW complet) mais via
   le pont Desktop.lanSync : ni nuage, ni serveur externe.
   Le poste « serveur » (configuré à l'installation) héberge la
   dernière image des données ; chaque poste pousse la sienne
   (débouncé) et tire celle du serveur (rappel 3,5 s) si elle est
   plus récente (« v » = Date.now du dernier écrit, LWW, écho src).
   En navigateur / LAN désactivé : aucune action.
   ============================================================ */
window.LanSync = (function () {
  var info = null;          // Desktop.lanInfo()
  var secret = '';          // config.json -> lan.secret
  var started = false;
  var VKEY = 'gs_lan_v';
  var lastV = 0;
  var dirty = false;
  var pushTimer = null;
  var applying = false;
  var pollTimer = null;
  var bootstrap = true;
  var busy = false;
  var lastError = '';
  var CID = window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : (Math.random().toString(36).slice(2) + Date.now().toString(36));

  function enabled() {
    return !!(info && info.enabled && info.mode !== 'off');
  }

  function applyV(v) {
    lastV = v;
    try { localStorage.setItem(VKEY, String(v)); } catch (e) { /* ignore */ }
  }

  function status() {
    var el = document.getElementById('topbar-lan');
    if (!el) return;
    if (!enabled()) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.classList.remove('hidden');
    var label = info.mode === 'server' ? 'LAN (serveur)' : 'LAN';
    if (info.running || info.mode === 'client') {
      el.textContent = lastError ? label + ' · problème' : label + ' · OK';
      el.style.color = lastError ? '#b91c1c' : '#15803d';
    } else {
      el.textContent = label + ' · arrêté';
      el.style.color = '#b45309';
    }
  }

  // ---- Écriture locale → marquage « à pousser » ----
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

  function lan(op, extra) {
    var req = Object.assign({ op: op, secret: secret }, extra || {});
    return Desktop.lanSync(JSON.stringify(req));
  }

  async function push() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (!enabled() || !dirty || applying || busy) return;
    dirty = false;
    busy = true;
    try {
      var data = await Store.exportData();
      var v = Date.now();
      var resp = await lan('push', { v: v, src: CID, data: data });
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'réponse serveur invalide');
      applyV(resp.v || v);
      lastError = '';
      status();
    } catch (e) {
      dirty = true;
      lastError = String(e && e.message || e);
      if (Desktop.isDesktop()) { try { Desktop.log('[lan] push impossible : ' + lastError); } catch (x) { /* ignore */ } }
      status();
      console.warn('LanSync push impossible :', e);
    } finally {
      busy = false;
      flush();
    }
  }

  async function applySnapshot(snap) {
    applying = true;
    try {
      await Store.importData(snap.data);
      applyV(snap.v);
      lastError = '';
      try { if (window.App && App.afterSync) App.afterSync(); } catch (e) { /* ignore */ }
      if (UI && UI.toast) UI.toast('Données synchronisées (réseau local).', 'ok');
    } finally {
      applying = false;
    }
  }

  async function pull() {
    if (!enabled() || applying || busy) return;
    busy = true;
    try {
      var st = await lan('state');
      if (!st || !st.ok) {
        if (st && st.error) { lastError = st.error; status(); }
        return;
      }
      lastError = '';
      if ((st.v || 0) > lastV && st.src !== CID) {
        var snap = await lan('pull');
        if (snap && snap.ok && snap.data) await applySnapshot(snap);
      }
      status();
    } catch (e) {
      lastError = String(e && e.message || e);
      status();
      if (Desktop.isDesktop()) { try { Desktop.log('[lan] pull impossible : ' + lastError); } catch (x) { /* ignore */ } }
    } finally {
      busy = false;
      if (bootstrap) { bootstrap = false; flush(); }
    }
  }

  async function start() {
    if (started) return;
    started = true;
    if (!window.Desktop || !Desktop.isDesktop()) { info = { enabled: false, mode: 'off' }; return; }
    try {
      var cfg = await Desktop.getConfig();
      var lanCfg = (cfg && cfg.lan) || {};
      secret = String(lanCfg.secret || '');
    } catch (e) { /* informatifs indisponibles */ }
    try { info = await Desktop.lanInfo(); } catch (e) { info = { enabled: false, mode: 'off' }; }
    try { lastV = Number(localStorage.getItem(VKEY)) || 0; } catch (e) { lastV = 0; }
    if (!enabled()) { status(); return; }
    try { Desktop.log('[lan] synchronisation activée : mode ' + info.mode + ' (' + (info.host || 'local') + ':' + info.port + ').'); } catch (e) { /* ignore */ }
    pull().then(function () { pollTimer = setInterval(pull, 3500); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(); });
  }

  // Recharge la configuration du réseau local après un changement depuis les
  // paramètres (nouveau secret / mode / hôte) sans redémarrer l'application.
  function reconfigure() {
    started = false;
    busy = false;
    dirty = false;
    bootstrap = true;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    start();
  }

  document.addEventListener('DOMContentLoaded', start);

  return {
    enabled: enabled,
    changed: changed,
    flush: flush,
    pull: pull,
    reconfigure: reconfigure,
    get info() { return info; }
  };
})();