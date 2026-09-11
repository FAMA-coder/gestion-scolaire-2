/* ============================================================
   js/license.js — Activation & renouvellement de la licence.
   Environnement bureau uniquement (WebView2) :
     · au démarrage, l'application vérifie la licence signée ;
     · si absente / expirée / invalide → écran d'activation :
       saisie de la clé d'activation remise par l'éditeur ;
     · la saisie est liée au CODE D'INSTALLATION du poste :
       l'écran l'affiche pour le transmettre à l'éditeur.
   En navigateur : aucune restriction, l'application est libre.

   Format de la clé (miroir exact de desktop/shared/LicenseKey.cs) :
     20 caractères "XXXXX-XXXXX-XXXXX-XXXXX" — alphabet
     23456789ABCDEFGHJKLMNPQRSTUVWXYZ (5 bits / caractère).
       charge utile (8 caractères, 5 octets) :
         [0-1] liaison au code d'installation (uint16),
         [2-3] jours UTC depuis 2020-01-01 (date d'émission),
         [4]   index de la période d'activation ;
       contrôle (12 caractères) :
         B32(simpleHash(hex(payload) + "|" + KEY_SEED))[0..12[.
   ============================================================ */
window.License = (function () {

  // Périodes d'activation autorisées (codes reconnus par l'hôte, ordre = index de clé).
  var PERIODS = [
    ['1m', '1 mois'],
    ['3m', '3 mois'],
    ['6m', '6 mois'],
    ['1a', '1 an'],
    ['2a', '2 ans'],
    ['3a', '3 ans'],
    ['5a', '5 ans'],
    ['permanent', 'Permanente']
  ];
  var PERIOD_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1a': 12, '2a': 24, '3a': 36, '5a': 60, 'permanent': 0 };

  // Graines (miroirs de LicenseSecrets.LicenseKeySeed et LicenseKey.BindSeed en C#).
  var KEY_SEED = 'GS::LICENSE::KEY::GEN::v1::4c91e2a07b5f3d8a';
  var BIND_SEED = 'GS::LICENSE::BIND::v1::2e7a90c14b6d3f58';

  // Alphabet des clés : sans 0/1/I/L/O ambigus.
  var B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var BASE_DAY = Date.UTC(2020, 0, 1) / 86400000;

  var LIC_STATUS_MAP = {
    active: { class: 'badge badge-ok', txt: 'Licence active' },
    permanent: { class: 'badge badge-purple', txt: 'Licence permanente' },
    expired: { class: 'badge badge-danger', txt: 'Licence expirée' },
    notactivated: { class: 'badge badge-warn', txt: 'Licence non activée' },
    invalid: { class: 'badge badge-danger', txt: 'Licence invalide' },
    tampered: { class: 'badge badge-danger', txt: 'Licence invalide' },
    othermachine: { class: 'badge badge-danger', txt: 'Licence liée à un autre poste' },
    error: { class: 'badge badge-danger', txt: 'Erreur de licence' }
  };

  // ================= Utils de clé d'activation =================

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function b32Encode(bytes) {
    var out = '', bits = 0, value = 0;
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) { out += B32[(value >> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
  }

  function b32Decode(s) {
    var map = {};
    for (var i = 0; i < B32.length; i++) map[B32[i]] = i;
    var bytes = [], bits = 0, value = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (map[c] == null) throw new Error('caractère non Base32');
      value = (value << 5) | map[c];
      bits += 5;
      if (bits >= 8) { bytes.push((value >> (bits - 8)) & 0xff); bits -= 8; }
    }
    return bytes;
  }

  function hexBytes(hex) {
    var out = [];
    for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
  }

  function bytesHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      s += (h.length < 2 ? '0' : '') + h;
    }
    return s;
  }

  function monthDays(issuedDay, months) {
    var d = new Date(issuedDay * 86400000);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    return Math.floor(d.getTime() / 86400000);
  }

  // Date UTC "yyyy-MM-dd" à partir du nombre de jours depuis 2020-01-01.
  function daysToStr(days) {
    var d = new Date(days * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function dayOfDate(d) { return Math.floor(d.getTime() / 86400000); }

  // ---- Liaison au code d'installation (uint16, identique au C#) ----
  function bind16(installCode) {
    return parseInt(AUTH_ENV.sha256(String(installCode == null ? '' : installCode) + '|' + BIND_SEED).slice(0, 4), 16);
  }

  function payloadBytes(installCode, periodCode, issuedUtc) {
    var idx = -1;
    for (var i = 0; i < PERIODS.length; i++) if (PERIODS[i][0] === String(periodCode || '').toLowerCase()) { idx = i; break; }
    if (idx < 0) throw new Error('Période d\'activation inconnue.');
    var bind = bind16(installCode);
    var days = Math.floor(dayOfDate(issuedUtc) - BASE_DAY);
    if (days < 0) days = 0;
    if (days > 65535) days = 65535;
    return [(bind >> 8) & 0xff, bind & 0xff, (days >> 8) & 0xff, days & 0xff, idx];
  }

  function checkString(payload) {
    return b32Encode(hexBytes(AUTH_ENV.sha256(bytesHex(payload) + '|' + KEY_SEED))).substr(0, 12);
  }

  function composeChars(all) {
    var g = '';
    for (var i = 0; i < all.length; i += 5) g += (g ? '-' : '') + all.substr(i, 5);
    return g;
  }

  // ---- Génération (éditeur : à partir du code d'installation du client) ----
  function Key_generate(installCode, periodCode, issuedUtc) {
    var issued = issuedUtc || new Date();
    var payload = payloadBytes(installCode, periodCode, issued);
    return composeChars(b32Encode(payload) + checkString(payload));
  }

  // ---- Lecture / vérification d'une clé saisie ----
  function Key_parse(raw) {
    if (!raw || !String(raw).trim()) return { ok: false, error: 'Saisissez la clé de licence.' };
    var s = String(raw).trim().toUpperCase().replace(/[\s-]/g, '');
    if (s.length !== 20) return { ok: false, error: 'La clé de licence doit contenir exactement 20 caractères.' };

    var payload;
    try { payload = b32Decode(s.substr(0, 8)); }
    catch (ex) { return { ok: false, error: 'Clé de licence illisible (caractères inattendus).' }; }
    if (payload.length !== 5) return { ok: false, error: 'Clé de licence au format inconnu.' };
    if (s.substr(8) !== checkString(payload)) return { ok: false, error: 'Clé de licence invalide (code de contrôle incorrect).' };

    var idx = payload[4];
    if (idx < 0 || idx >= PERIODS.length) return { ok: false, error: 'Période d\'activation incluse dans la clé inconnue.' };
    var period = PERIODS[idx][0];
    var perm = period === 'permanent';
    var days = (payload[2] << 8) | payload[3];
    var issued = daysToStr(BASE_DAY + days);
    var expires = '';
    if (!perm) {
      var m = PERIOD_MONTHS[period];
      var expDay = BASE_DAY + days;
      expDay = monthDays(expDay, m);
      expires = daysToStr(expDay);
    }
    return {
      ok: true,
      info: {
        permanent: perm,
        period: period,
        issued: issued,
        expires: expires,
        bind: (payload[0] << 8) | payload[1]
      }
    };
  }

  // ---- Vérification de la liaison au code d'installation ----
  function Key_matches(installCode, info) {
    return !!(info && bind16(installCode) === info.bind);
  }

  function copyText(t) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); UI.toast('Clé copiée dans le presse-papiers.', 'ok'); }
      catch (e) { UI.toast('Sélectionnez la clé et copiez-la manuellement.', 'err'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { UI.toast('Clé copiée dans le presse-papiers.', 'ok'); }, fallback);
    } else fallback();
  }

  // Coordonnées de l'éditeur pour obtenir / renouveler une licence.
  var EDITOR = {
    name: 'Dr FANE Mahama',
    phone1: '+223 76301028',
    phone2: '+223 63115278',
    email: 'mahamaf1@outlook.fr'
  };

  function editorHtml() {
    return '<div class="lic-editor">' +
      '<div class="lic-editor-title">Pour obtenir une licence / un renouvellement, contactez l\'éditeur :</div>' +
      '<div class="lic-editor-line"><b>' + UI.esc(EDITOR.name) + '</b></div>' +
      '<div class="lic-editor-line">Tél : <a href="tel:+22376301028">' + UI.esc(EDITOR.phone1) + '</a> / <a href="tel:+22363115278">' + UI.esc(EDITOR.phone2) + '</a></div>' +
      '<div class="lic-editor-line">Email : <a href="mailto:' + UI.esc(EDITOR.email) + '">' + UI.esc(EDITOR.email) + '</a></div>' +
      '</div>';
  }

  // ---- Renouvellement volontaire (avant terme) : nouveau code + contact éditeur ----
  async function openRenewal() {
    if (!window.Desktop || !Desktop.isDesktop()) {
      UI.toast('Disponible dans l\'application installée sur ce poste.', 'err');
      return;
    }
    var res;
    try { res = await Desktop.renewInstallCode(); } catch (e) { res = null; }
    if (!res || !res.ok) {
      UI.toast((res && res.error) || 'Impossible de générer un nouveau code d\'installation.', 'err');
      return;
    }
    var code = String(res.installCode || '');
    var fmt = formatCode(code);
    var m = UI.modal(
      '<p class="hint">Votre licence actuelle reste <b>valable jusqu\'à son terme</b> — le code ci-dessous ne l\'altère pas. ' +
      'Un nouveau code d\'installation a été généré pour ce poste : il servira uniquement à la prochaine clé.</p>' +
      '<div class="field">' +
        '<label>Nouveau code d\'installation — à transmettre à l\'éditeur</label>' +
        '<input id="renew-code" class="lic-code-value" style="width:100%" readonly value="' + UI.esc(fmt) + '">' +
      '</div>' +
      '<p class="hint">Transmettez ce code à l\'éditeur pour la génération de la nouvelle licence :</p>' +
      editorHtml(),
      '<button class="btn btn-ghost" data-r-copy>Copier le code</button>' +
      '<button class="btn btn-primary" data-r-close>Fermer</button>',
      { title: 'Renouvellement de la licence', size: 'modal modal-sm' });
    m.modal.querySelector('[data-r-close]').onclick = function () { m.close(); };
    m.modal.querySelector('[data-r-copy]').onclick = function () { copyText(code); };
  }

  // ================= Écran d'activation =================

  function setScreens(showId) {
    ['screen-license', 'screen-meta', 'screen-login', 'app-shell'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== showId);
    });
  }

  function reveal() {
    try { document.documentElement.style.visibility = ''; } catch (e) { /* ignore */ }
  }

  function showNormal() { reveal(); }

  // ---- Import de la configuration d'installation (écoles + comptes) ----
  async function applyInstallConfig() {
    if (!Desktop.isDesktop()) return;
    try {
      var cfg = await Desktop.getConfig();
      if (!cfg || cfg.processed) return;
      try { Desktop.log('[install-config] config détectée, import en cours…'); } catch (e) { /* ignore */ }

      await Meta.ready();
      var existing = await Meta.allSchools();
      var created = [];
      var schools = cfg.schools || [];

      for (var i = 0; i < schools.length; i++) {
        var school = schools[i];
        if (!(school && school.nom)) continue;
        var key = String(school.nom).trim().toLowerCase();
        var s = existing.find(function (x) { return String(x.nom || '').trim().toLowerCase() === key; });
        if (!s) {
          try {
            s = await Meta.createSchool(String(school.nom).trim());
            existing.push(s);
          } catch (e0) {
            try { Desktop.log('[install-config] école non créée : ' + school.nom + ' — ' + (e0 && e0.message || e0)); } catch (e1) { /* ignore */ }
            continue;
          }
        }
        created.push(s);

        var users = school.users || [];
        for (var j = 0; j < users.length; j++) {
          var u = users[j];
          if (!(u && u.username && u.password)) continue;
          try {
            await Meta.createAccount(s, {
              nom: u.nom || '', prenom: u.prenom || '',
              username: u.username, password: u.password,
              role: u.role || 'directeur', actif: true
            });
          } catch (e) {
            try { Desktop.log('[install-config] compte non créé : ' + u.username + ' — ' + (e && e.message || e)); } catch (e2) { /* ignore */ }
          }
        }
      }

      await Desktop.markConfigProcessed();
      if (window.App && App.renderSchools) { try { App.renderSchools(); } catch (e) { /* ignore */ } }
      try { Desktop.log('[install-config] configuration appliquée : ' + created.length + ' école(s).'); } catch (e) { /* ignore */ }
    } catch (e) {
      try { Desktop.log('[install-config] échec de l\'import : ' + (e && e.message || e)); } catch (e2) { /* ignore */ }
      console.warn('Configuration d\'installation non appliquée :', e);
    }
  }

  function periodOptions(selected) {
    return PERIODS.map(function (p) {
      return '<option value="' + p[0] + '"' + (p[0] === selected ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('');
  }

  function frDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch (e) { return iso; }
  }

  // Affichage lisible du code d'installation : XXXX-XXXX-XXXX.
  function formatCode(raw) {
    var s = String(raw || '').trim();
    if (!/^[0-9A-Z]{12}$/i.test(s)) return s;
    return s.substr(0, 4) + '-' + s.substr(4, 4) + '-' + s.substr(8, 4);
  }

  function renderStatus(lic) {
    var box = document.getElementById('lic-status');
    if (!box) return;
    box.classList.remove('hidden');
    var line = document.getElementById('lic-status-line');
    var st = LIC_STATUS_MAP[lic && lic.status] || LIC_STATUS_MAP.error;
    var html = '<div class="bar" style="align-items:center"><span class="badge ' + st.class + '">' + st.txt + '</span>';
    if (lic && lic.permanent) {
      html += '<span class="hint">Activation permanente — aucune expiration.</span>';
    } else if (lic && lic.expires) {
      var d = lic.remainingDays;
      html += '<span class="hint">Expire le <b>' + frDate(lic.expires) + '</b> (reste ' + (d != null ? Math.ceil(d) : '?') + ' jour(s)).</span>';
    }
    if (lic && lic.activationDate) {
      html += '<span class="hint">Activée le ' + frDate(lic.activationDate) + '</span>';
    }
    if (lic && lic.message) html += '<span class="hint">' + lic.message + '</span>';
    html += '</div>';
    box.innerHTML = html;
    if (line) line.textContent = (lic && lic.status === 'expired') ? 'Votre licence a expiré' :
      ((lic && lic.status === 'notactivated') ? 'Activation requise' :
      (lic && lic.status === 'tampered') ? 'Licence invalide' :
      (lic && lic.status === 'othermachine') ? 'Licence liée à un autre poste' : 'Activation de l\'application');

    // Code d'installation : à transmettre à l'éditeur pour obtenir la clé.
    var codeBox = document.getElementById('lic-install-code');
    if (codeBox) {
      var code = lic && lic.installCode ? String(lic.installCode) : '';
      codeBox.classList.toggle('hidden', !code);
      codeBox.querySelector('#lic-code-value').textContent = formatCode(code);
      var lbl = document.getElementById('lic-code-label');
      if (lbl) lbl.textContent = lic && lic.status === 'expired'
        ? 'NOUVEAU code d\'installation de CE POSTE — à transmettre à l\'éditeur'
        : 'Code d\'installation de CE POSTE — à transmettre à l\'éditeur';
    }

    var hint = document.getElementById('lic-hint-msg');
    if (hint) hint.textContent = lic && lic.status === 'expired'
      ? 'Votre licence a expiré : un nouveau code d\'installation a été généré pour ce poste. Transmettez ce code à l\'éditeur, puis collez ici la nouvelle clé d\'activation reçue.'
      : 'Transmettez votre code d\'installation à l\'éditeur puis saisissez la clé de licence reçue.';
  }

  function showError(msg) {
    var err = document.getElementById('lic-error');
    if (!err) return;
    err.textContent = msg;
    err.classList.remove('hidden');
  }
  function hideError() {
    var err = document.getElementById('lic-error');
    if (err) err.classList.add('hidden');
  }

  function bindActivate() {
    var form = document.getElementById('license-form');
    if (!form) return;
    document.getElementById('lic-quit').addEventListener('click', function () { Desktop.quit(); });
    document.getElementById('lic-copy-code').addEventListener('click', function () {
      var el = document.getElementById('lic-code-value');
      if (!el || !el.textContent) return;
      copyText(el.textContent.trim());
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideError();
      var key = document.getElementById('lic-key').value.trim();
      if (!key) { showError('Saisissez la clé de licence.'); return; }
      var check = Key_parse(key);
      if (!check.ok) { showError(check.error); return; }
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true; btn.textContent = 'Activation…';
      try {
        var lic = await Desktop.activateKey(key);
        if (lic && (lic.error || !lic.ok)) { showError((lic.error || lic.message) || 'Échec de l\'activation.'); btn.disabled = false; btn.textContent = 'Activer'; return; }
        renderStatus(lic || lic);
        UI.toast(lic && lic.permanent ? 'Licence activée (permanente).' : 'Licence activée. L\'application va se relancer.', 'ok');
        setTimeout(function () { window.location.reload(); }, 1200);
      } catch (err) {
        showError('Erreur d\'activation : ' + (err && err.message ? err.message : err));
        btn.disabled = false; btn.textContent = 'Activer';
      }
    });
  }

  // ================= Générateur de licence (éditeur) =================

  function genErr(body, msg) {
    var e = body.querySelector('.of-error');
    if (!e) { e = document.createElement('div'); e.className = 'login-error of-error'; body.appendChild(e); }
    e.textContent = msg;
  }

  function openGenerator() {
    // Disponible aussi en navigateur (avant toute installation) : la vérification du
    // compte maître utilise la base locale gs_meta ; la génération ne requiert aucun
    // matériel installé — uniquement le code d'installation du poste du client.
    UI.prompt('Identifiants du compte maître', `
      <div class="field"><label>Identifiant global *</label><input id="gen-user" required autocomplete="off"></div>
      <div class="field"><label>Mot de passe *</label><input id="gen-pwd" type="password" required autocomplete="new-password"></div>
      <p class="hint">Seul le compte maître (COMPTE ADMIN global) peut générer des licences. La période d'activation et la liaison au code d'installation du poste sont définies au moment de la génération.</p>
    `, async (body) => {
      var user = body.querySelector('#gen-user').value.trim();
      var pwd = body.querySelector('#gen-pwd').value;
      if (!user || !pwd) { genErr(body, 'Saisissez les identifiants du compte maître.'); return false; }
      var res = await Meta.loginTenant(user, pwd);
      if (!res.ok) { genErr(body, res.msg || 'Identifiants du compte maître incorrects.'); return false; }
      UI.closeModal();
      showGenerator(user);
      return true;
    }, { size: 'modal modal-sm', okLabel: 'Continuer', title: 'Générateur de licence' });
  }

  function isValidInstallCode(code) {
    return typeof code === 'string' && /^[2-9A-HJ-NP-Z]{12}$/i.test(code.trim());
  }

  function showGenerator(master) {
    var m = UI.modal(
      '<div class="field"><label>Code d\'installation du poste du client *</label><input id="k-code" placeholder="XXXX-XXXX-XXXX" maxlength="15" autocomplete="off"></div>' +
      '<p class="hint">Ce code est affiché à la fin de l\'installation sur le poste de l\'acquéreur. La clé générée ne sera valable que pour ce code.</p>' +
      '<div class="field"><label>Période d\'activation (définie à la génération)</label><select id="k-period"></select></div>' +
      '<div id="k-out" class="k-out hidden"></div>',
      '<button class="btn btn-ghost" data-k-cancel>Fermer</button>' +
      '<button class="btn btn-primary" data-k-gen>Générer la clé</button>',
      { title: 'Générateur de licence — contact ' + (master || ''), size: 'modal modal-lg' });
    m.modal.querySelector('#k-period').innerHTML = periodOptions();
    m.modal.querySelector('[data-k-cancel]').onclick = function () { m.close(); };
    var codeInput = m.modal.querySelector('#k-code');
    codeInput.addEventListener('input', function () {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '').slice(0, 14);
    });
    m.modal.querySelector('[data-k-gen]').onclick = function () {
      var code = (codeInput.value || '').trim();
      if (!isValidInstallCode(code)) {
        genErr(m.modal.querySelector('.modal-body'), 'Saisissez le code d\'installation fourni par le client (12 caractères, ex. 8FJK2LMPQ4WX).');
        return;
      }
      var out = m.modal.querySelector('#k-out');
      out.classList.remove('hidden');
      var key;
      try {
        key = Key_generate(code, m.modal.querySelector('#k-period').value, new Date());
      } catch (e) {
        genErr(m.modal.querySelector('.modal-body'), String(e && e.message || e));
        return;
      }
      var info = Key_parse(key).info;
      out.innerHTML =
        '<label>Clé d\'activation (à transmettre au client pour « ' + UI.esc(code) + ' »)</label>' +
        '<textarea id="k-key" readonly rows="2" style="width:100%;font-family:Consolas,Menlo,monospace;font-size:15px">' + UI.esc(key) + '</textarea>' +
        '<div class="bar" style="margin-top:8px">' +
          '<button class="btn btn-sm btn-primary" data-k-copy>Copier la clé</button>' +
          '<span class="hint" style="align-self:center">' + (info.permanent
            ? 'Activation permanente — aucune expiration.'
            : 'Période : ' + info.period + ' — expire le <b>' + frDate(info.expires) + '</b> (émise le ' + frDate(info.issued) + ').') + '</span>' +
        '</div>';
      m.modal.querySelector('[data-k-copy]').onclick = function () { copyText(key); };
      var oldErr = m.modal.querySelector('.of-error');
      if (oldErr) oldErr.remove();
      if (Desktop.isDesktop()) { try { Desktop.log('[licence] clé générée pour code ' + code + ' — ' + info.period + ' / expire ' + (info.expires || '—')); } catch (e) { /* ignore */ } }
    };
  }

  // ================= Vérification de la licence + blocage éventuel =================

  async function enforceLicense() {
    var lic;
    try { lic = await Desktop.getLicense(); } catch (e) { lic = { status: 'error', message: String(e && e.message || e) }; }
    try { Desktop.log('[license] état détecté : ' + (lic && lic.status || 'unknown')); } catch (e) { /* ignore */ }
    if (lic && (lic.status === 'active' || lic.status === 'permanent')) {
      showNormal();
      return;
    }
    renderStatus(lic);
    setScreens('screen-license');
    bindActivate();
    reveal();
  }

  // ---- Point d'entrée ----
  async function boot() {
    if (!Desktop.isDesktop()) { showNormal(); return; }
    try { await Desktop.ready(); } catch (e) { /* ignore */ }
    if (!Desktop.isDesktop()) { showNormal(); return; }
    try { await applyInstallConfig(); } catch (e) { console.warn(e); }
    try { await enforceLicense(); } catch (e) {
      console.error(e);
      setScreens('screen-license');
      showError('Erreur de licence : ' + (e && e.message ? e.message : e));
      reveal();
    }
    // Bouton « Licence » (renouvellement volontaire) de la barre supérieure.
    var renewBtn = document.getElementById('btn-lic-renew');
    if (renewBtn) {
      renewBtn.classList.remove('hidden');
      renewBtn.addEventListener('click', openRenewal);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    boot: boot,
    PERIODS: PERIODS,
    applyInstallConfig: applyInstallConfig,
    enforceLicense: enforceLicense,
    openGenerator: openGenerator,
    openRenewal: openRenewal,
    isValidInstallCode: isValidInstallCode,
    Key: {
      generate: Key_generate,
      parse: Key_parse,
      matches: Key_matches,
      monthsOf: function (c) { return PERIOD_MONTHS[String(c || '').toLowerCase()]; }
    }
  };
})();