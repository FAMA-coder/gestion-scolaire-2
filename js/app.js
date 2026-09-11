/* ============================================================
   app.js — Coquille, navigation, session, multi-écoles
   ============================================================ */
window.App = (function () {
  const NS = {};
  NS.screens = {};
  NS.navGroups = {};
  NS.current = null;
  NS.currentCtx = null;

  NS.register = function (key, screen) {
    NS.screens[key] = screen;
    const grp = screen.group || 'Général';
    if (!NS.navGroups[grp]) NS.navGroups[grp] = [];
    NS.navGroups[grp].push({ key: key, label: screen.navLabel || screen.title, icon: screen.icon || '' });
  };

  NS.go = function (key, ctx) {
    const s = NS.screens[key];
    if (!s) { NS.go('dashboard', ctx); return; }
    if (s.perm && !Auth.can(s.perm)) { UI.toast('Accès refusé pour votre rôle.', 'err'); return; }
    NS.current = key;
    NS.currentCtx = ctx || null;
    const content = document.getElementById('content');
    content.innerHTML = '';
    document.getElementById('topbar-title').textContent = s.title;
    buildNav();
    s.render(content, ctx);
  };

  function buildNav() {
    const nav = document.getElementById('side-nav');
    nav.innerHTML = '';
    Object.keys(NS.navGroups).forEach((grp) => {
const items = NS.navGroups[grp].filter((it) => {
      const s = NS.screens[it.key];
      if (s.hidden) return false;
      return !s.perm || Auth.can(s.perm);
    });
      if (!items.length) return;
      const g = document.createElement('div');
      g.className = 'nav-group';
      g.textContent = grp;
      nav.appendChild(g);
      items.forEach((it) => {
        const item = document.createElement('div');
        item.className = 'nav-item' + (NS.current === it.key ? ' active' : '');
        item.innerHTML = '<span class="nav-ico">' + UI.esc(it.icon || '') + '</span><span>' + UI.esc(it.label) + '</span>';
        item.onclick = () => NS.go(it.key);
        nav.appendChild(item);
      });
    });
    // Repli automatique du menu sur petit écran
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
  }

  async function refreshBranding() {
    const eco = await DB.get('ecole', 1);
    if (!eco) return;
    window.PAIEMENT = Object.assign({ devise: 'FCFA', decimales: 0, modes: ['Espèces', 'Chèque', 'Virement bancaire', 'Mobile Money'] }, eco.paiement || {});
    const name = eco.nom || 'Gestion Scolaire';
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('login-school-name', name);
    set('login-school-slogan', eco.slogan || 'Application autonome de gestion scolaire');
    set('side-school-name', name);
    if (eco.logo) {
      const l1 = document.getElementById('login-logo');
      const l2 = document.getElementById('side-logo');
      if (l1) l1.innerHTML = '<img src="' + eco.logo + '" alt="logo">';
      if (l2) l2.innerHTML = '<img src="' + eco.logo + '" alt="logo">';
    }
    const annees = await DB.getAll('annees');
    const elAnnee = document.getElementById('topbar-annee');
    if (eco.anneeEnCoursId && annees && elAnnee) {
      const a = annees.find((x) => x.id === eco.anneeEnCoursId);
      if (a) elAnnee.textContent = a.libelle;
    }
  }

  function setScreens(show) {
    ['screen-meta', 'screen-login', 'app-shell'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== show);
    });
  }

  function showMeta() { Auth.logout(); setScreens('screen-meta'); }
  function showLogin() {
    setScreens('screen-login');
    const err = document.getElementById('login-error');
    if (err) err.classList.add('hidden');
  }
  async function showShell() {
    setScreens('app-shell');
    const u = Auth.currentUser();
    if (!u) { showLogin(); return; }
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('side-user-name', (u.nom + ' ' + (u.prenom || '')).trim());
    set('side-user-role', Auth.roleLib(u.role));
    set('side-user-avatar', UI.avatar(u.nom, u.prenom));
    const rl = document.getElementById('topbar-context');
    if (rl) rl.innerHTML = '<span class="badge ' + Auth.roleClass(u.role) + '">' + UI.esc(Auth.roleLib(u.role)) + '</span>';
    buildNav();
    await refreshBranding();
    NS.go('dashboard');
  }

  // Rafraîchissement après une synchronisation arrivée d'un autre appareil :
  // revalide la session courante (compte supprimé/désactivé à distance) puis
  // re-rend l'écran affiché pour refléter les données à jour.
  async function afterSync() {
    try { await refreshBranding(); } catch (e) { /* ignore */ }
    const u = Auth.currentUser();
    if (!u) {
      const metaScreen = document.getElementById('screen-meta');
      if (metaScreen && !metaScreen.classList.contains('hidden')) {
        try { renderSchools(); } catch (e) { /* ignore */ }
        const am = NS.accountsModal;
        if (am && am.m && am.m.modal && document.body.contains(am.m.modal)) {
          try { await renderAccounts(am.m, am.body, am.schools, null); } catch (e) { /* ignore */ }
        }
      }
      return;
    }
    // Compte maître (FAMA) : accès garanti, ne dépend pas de la base d'utilisateurs.
    if (Auth.isMaster(u)) {
      if (NS.current && NS.screens[NS.current]) NS.go(NS.current, NS.currentCtx);
      return;
    }
    let fresh = null;
    try { fresh = await DB.get('users', u.id); } catch (e) { /* ignore */ }
    if (!fresh) {
      Auth.logout();
      UI.toast('Votre compte a été supprimé sur un autre poste.', 'err');
      showLogin();
      return;
    }
    if (fresh.actif === false) {
      Auth.logout();
      UI.toast('Votre compte a été désactivé sur un autre poste.', 'err');
      showLogin();
      return;
    }
    if (NS.current && NS.screens[NS.current]) NS.go(NS.current, NS.currentCtx);
  }

  // ---- Gestion des écoles (panneau admin global) ----
  function tenantUi() {
    const admin = document.getElementById('meta-admin');
    if (admin) admin.classList.toggle('hidden', !Meta.currentTenant());
  }
  function adminLoginForm() {
    UI.prompt('Connexion au compte ADMIN (global)', `
      <div class="field"><label>Identifiant global *</label><input id="al-user" required placeholder="Identifiant global" autocomplete="off" autocapitalize="none" autocorrect="off"></div>
      <div class="field"><label>Mot de passe *</label><input id="al-pwd" type="password" required placeholder="Mot de passe" autocomplete="new-password"></div>
    `, async (body) => {
      const res = await Meta.loginTenant(body.querySelector('#al-user').value.trim(), body.querySelector('#al-pwd').value);
      if (!res.ok) {
        let errBox = body.querySelector('.of-error');
        if (!errBox) { errBox = document.createElement('div'); errBox.className = 'login-error of-error'; body.appendChild(errBox); }
        errBox.textContent = res.msg;
        return false;
      }
      UI.closeModal();
      UI.toast('Connexion admin réussie.', 'ok');
      tenantUi();
      renderSchools();
      return true;
    }, { size: 'modal modal-sm' });
  }
  function openAccessForm() {
    UI.prompt('Connexion à votre école', `
      <div class="field"><label>Nom de l'école *</label><input id="of-school" required placeholder="Nom donné à l'école lors de sa création"></div>
      <div class="field"><label>Identifiant *</label><input id="of-user" required placeholder="Identifiant" autocomplete="off" autocapitalize="none" autocorrect="off"></div>
      <div class="field"><label>Mot de passe *</label><input id="of-pwd" type="password" required placeholder="Mot de passe" autocomplete="new-password"></div>
    `, async (body) => {
      const nom = body.querySelector('#of-school').value.trim();
      if (!nom) { UI.toast('Saisissez le nom de l\'école.', 'err'); return false; }
      const schools = await Meta.allSchools();
      if (!schools.length) { UI.toast('Aucune école créée. Connectez-vous en COMPTE ADMIN pour la créer.', 'err'); return false; }
      const s = schools.find((x) => String(x.nom || '').trim().toLowerCase() === nom.toLowerCase());
      if (!s) {
        let errBox = body.querySelector('.of-error');
        if (!errBox) { errBox = document.createElement('div'); errBox.className = 'login-error of-error'; body.appendChild(errBox); }
        errBox.textContent = 'École introuvable. Vérifiez le nom exact saisi lors de la création.';
        return false;
      }
      const ok = await openSchoolAndLogin(s.id, body.querySelector('#of-user').value.trim(), body.querySelector('#of-pwd').value, body);
      if (ok) { UI.closeModal(); return true; }
      return false;
    }, { size: 'modal modal-sm' });
  }
  async function openSchoolAndLogin(schoolId, un, pw, body) {
    const s = await Meta.getSchool(schoolId);
    if (!s) { UI.toast('École introuvable.', 'err'); return false; }
    if (s.bloque) { UI.toast('Accès bloqué à cette école par l\'administrateur global.', 'err'); return false; }
    Meta.setCurrentSchool(s.id);
    DB.openSchool(Meta.dbNameFor(s));
    Auth.logout();
    await DB.ready();
    const res = await Auth.login(un, pw);
    if (!res.ok) {
      let errBox = body.querySelector('.of-error');
      if (!errBox) { errBox = document.createElement('div'); errBox.className = 'login-error of-error'; body.appendChild(errBox); }
      errBox.textContent = res.msg;
      return false;
    }
    const nm = document.getElementById('login-school-name');
    if (nm) nm.textContent = s.nom || 'Gestion Scolaire';
    await showShell();
    return true;
  }

  async function renderSchools() {
    const listEl = document.getElementById('school-list');
    if (!listEl || !Meta.currentTenant()) return;
    const schools = await Meta.allSchools();
    listEl.innerHTML = '';
    if (!schools.length) { listEl.innerHTML = '<div class="notice">Aucune école. Créez votre première école.</div>'; return; }
    for (const s of schools) {
      const row = document.createElement('div');
      row.className = 'school-card' + (s.bloque ? ' blocked' : '');
      const info = document.createElement('div');
      info.className = 'school-info';
      info.innerHTML = '<div class="school-name">' + UI.esc(s.nom) + (s.bloque ? ' <span class="badge badge-danger">Accès bloqué</span>' : '') + '</div><div class="school-db">' + UI.esc(Meta.dbNameFor(s)) + '</div>';
      const actions = document.createElement('div');
      actions.className = 'school-actions';
      const block = document.createElement('button');
      block.className = 'btn btn-sm ' + (s.bloque ? 'btn-ok' : 'btn-outline');
      block.textContent = s.bloque ? 'Débloquer' : 'Bloquer';
      block.title = s.bloque ? 'Réautoriser l\'accès à cette école' : 'Interdire l\'accès à cette école';
      block.onclick = async () => {
        const nv = !s.bloque;
        await Meta.setSchoolBlocked(s.id, nv);
        UI.toast(nv ? 'Accès à l\'école bloqué.' : 'Accès à l\'école rétabli.', 'ok');
        renderSchools();
      };
      const edit = document.createElement('button');
      edit.className = 'btn btn-sm btn-outline'; edit.textContent = 'Modifier';
      edit.onclick = () => renameSchool(s);
      const del = document.createElement('button');
      del.className = 'btn btn-sm btn-danger'; del.textContent = 'Supprimer';
      del.onclick = () => removeSchool(s);
      actions.appendChild(block); actions.appendChild(edit); actions.appendChild(del);
      row.appendChild(info); row.appendChild(actions);
      listEl.appendChild(row);
    }
  }
  function renameSchool(s) {
    UI.prompt('Modifier le nom de l\'école', `
      <div class="field"><label>Nom de l'école *</label><input id="rn-name" value="${UI.esc(s.nom)}" required></div>
    `, async (body) => {
      const nom = body.querySelector('#rn-name').value.trim();
      if (!nom) { UI.toast('Nom requis.', 'err'); return false; }
      await Meta.renameSchool(s.id, nom);
      UI.closeModal(); UI.toast('École renommée.', 'ok'); renderSchools();
      return true;
    }, { size: 'modal modal-sm' });
  }
  function createSchoolPrompt() {
    if (!Meta.currentTenant()) { UI.toast('Connectez-vous d\'abord en COMPTE ADMIN.', 'err'); return; }
    UI.prompt('Nouvelle école', `
      <div class="field"><label>Nom de l'école *</label><input id="ns-name" required placeholder="Ex : Collège Saint-Joseph"></div>
    `, async (body) => {
      const nom = body.querySelector('#ns-name').value.trim();
      if (!nom) { UI.toast('Nom requis.', 'err'); return false; }
      await Meta.createSchool(nom);
      UI.closeModal(); UI.toast('École créée.', 'ok'); renderSchools();
      return true;
    }, { size: 'modal modal-sm' });
  }
  function removeSchool(s) {
    UI.confirm('Supprimer définitivement l\'école « ' + s.nom + ' » et toutes ses données ?', async () => {
      await Meta.deleteSchool(s.id);
      UI.toast('École supprimée.', 'ok');
      renderSchools();
    }, { title: 'Supprimer une école' });
  }

  // ---- Gestion des comptes utilisateurs (admin global) ----
  async function openAccountsManager() {
    if (!Meta.currentTenant()) { UI.toast('Connectez-vous d\'abord en COMPTE ADMIN.', 'err'); return; }
    const schools = await Meta.allSchools();
    if (!schools.length) { UI.toast('Aucune école. Créez d\'abord une école.', 'err'); return; }
    const m = UI.modal('', '', { title: 'Gestion des comptes utilisateurs', size: 'modal modal-lg' });
    const body = m.modal.querySelector('.modal-body');
    await renderAccounts(m, body, schools, null);
    NS.accountsModal = { m: m, body: body, schools: schools };
  }

  async function renderAccounts(m, body, schools, selectedId) {
    body.innerHTML = '<div class="empty">Chargement des comptes…</div>';
    const accounts = await Meta.listAllAccounts();
    const roleSelHtml = roleOptions();
    body.innerHTML =
      '<div class="bar" style="margin-bottom:12px"><button class="btn btn-primary" id="acc-add">+ Nouveau compte</button>' +
      '<span class="hint">' + accounts.length + ' compte(s) sur ' + schools.length + ' école(s)</span></div>' +
      '<div id="acc-tbl"></div>';
    body.querySelector('#acc-add').onclick = () => accountForm(m, body, schools, null, accounts, selectedId);
    const rows = accounts.map((a, idx) => {
      const rl = Auth.ROLES[a.role] || {};
      return '<tr>' +
        '<td><strong>' + UI.esc((a.nom || '') + ' ' + (a.prenom || '')) + '</strong></td>' +
        '<td>' + UI.esc(a.username) + '</td>' +
        '<td><span class="badge ' + (rl.class || 'badge-gray') + '">' + UI.esc(Auth.roleLib(a.role)) + '</span></td>' +
        '<td>' + UI.esc(a.schoolName) + '</td>' +
        '<td>' + (a.actif ? '<span class="badge badge-ok">Actif</span>' : '<span class="badge badge-gray">Inactif</span>') + '</td>' +
        '<td class="actions-cell">' +
          '<button class="btn btn-sm btn-outline" data-edit="' + idx + '">Modifier</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + idx + '">Suppr.</button>' +
        '</td></tr>';
    }).join('');
    body.querySelector('#acc-tbl').innerHTML = UI.table(['Nom', 'Identifiant', 'Rôle', 'École', 'Statut', 'Actions'], rows || UI.empty(6));
    body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const acc = accounts[Number(b.dataset.edit)];
      if (acc) accountForm(m, body, schools, acc, accounts, selectedId);
    });
    body.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
      const acc = accounts[Number(b.dataset.del)];
      if (acc) deleteAccountFlow(m, body, schools, acc, accounts, selectedId);
    });
  }

  async function roleOptions(selected) {
    const roles = await Auth.editableRoles();
    const isSuper = Auth.isSuperAdmin();
    return roles.map((r) => {
      if (r === 'super_admin' && !isSuper && String(selected) !== 'super_admin') return '';
      const rl = Auth.ROLES[r];
      return '<option value="' + r + '"' + (selected === r ? ' selected' : '') + '>' + UI.esc(rl ? rl.libelle : r) + '</option>';
    }).join('');
  }
  function schoolOptions(schools, selectedId) {
    return '<option value="">Choisir une école…</option>' + schools.map((s) =>
      '<option value="' + s.id + '"' + (Number(s.id) === Number(selectedId) ? ' selected' : '') + '>' + UI.esc(s.nom) + '</option>').join('');
  }

  async function accountForm(m, body, schools, acc, accounts, selectedId) {
    acc = acc || {};
    const isNew = !acc.id;
    const roleSel = await roleOptions(acc.role || '');
    const schoolSel = isNew
      ? '<div class="field"><label>École (affectation) *</label><select id="ac-school">' + schoolOptions(schools, selectedId || '') + '</select></div>'
      : '<div class="field"><label>École</label><input value="' + UI.esc(acc.schoolName) + '" readonly></div>';
    const formM = UI.prompt(isNew ? 'Nouveau compte utilisateur' : 'Modifier le compte utilisateur', `
      ${schoolSel}
      <div class="row">
        <div class="field"><label>Nom *</label><input id="ac-nom" value="${UI.esc(acc.nom || '')}" required></div>
        <div class="field"><label>Prénom</label><input id="ac-prenom" value="${UI.esc(acc.prenom || '')}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Identifiant *</label><input id="ac-username" value="${UI.esc(acc.username || '')}" required autocomplete="off" autocapitalize="none" autocorrect="off"></div>
        <div class="field"><label>Rôle *</label><select id="ac-role">${roleSel}</select></div>
      </div>
      <div class="field"><label>${isNew ? 'Mot de passe *' : 'Nouveau mot de passe (laisser vide pour conserver)'}</label><input id="ac-pwd" type="password"${isNew ? ' required' : ''} autocomplete="new-password"></div>
      <div class="field"><label><input type="checkbox" id="ac-actif"${acc.actif !== false ? ' checked' : ''}> Compte actif</label></div>
    `, async (f) => {
      const nom = f.querySelector('#ac-nom').value.trim();
      const prenom = f.querySelector('#ac-prenom').value.trim();
      const username = f.querySelector('#ac-username').value.trim();
      const role = f.querySelector('#ac-role').value;
      const pwd = f.querySelector('#ac-pwd').value;
      const actif = f.querySelector('#ac-actif').checked;
      if (!nom || !username || !role) { UI.toast('Renseignez nom, identifiant et rôle.', 'err'); return false; }
      if (isNew) {
        if (!pwd) { UI.toast('Mot de passe requis.', 'err'); return false; }
        const schoolId = Number(f.querySelector('#ac-school').value);
        if (!schoolId) { UI.toast('Choisissez l\'école d\'affectation.', 'err'); return false; }
        const school = schools.find((s) => s.id === schoolId);
        const res = await Meta.createAccount(school, { nom, prenom, username, role, password: pwd, actif });
        if (!res.ok) { UI.toast(res.msg, 'err'); return false; }
      } else {
        if (pwd && pwd.length < 4) { UI.toast('Le mot de passe doit contenir au moins 4 caractères.', 'err'); return false; }
        const school = await Meta.getSchool(acc.schoolId);
        const res = await Meta.updateAccount(school, { id: acc.id, nom, prenom, username, role, password: pwd || undefined, actif });
        if (!res.ok) { UI.toast(res.msg, 'err'); return false; }
      }
      UI.closeModal();
      UI.toast(isNew ? 'Compte utilisateur créé.' : 'Compte utilisateur modifié.', 'ok');
      await renderAccounts(m, body, schools, isNew ? undefined : acc.schoolId);
      return true;
    }, { size: 'modal' });
  }

  function deleteAccountFlow(m, body, schools, acc, accounts, selectedId) {
    UI.confirm('Supprimer le compte « ' + (acc.nom + ' ' + (acc.prenom || '')).trim() + ' » (' + acc.username + ') de l\'école « ' + acc.schoolName + ' » ?', async () => {
      const school = await Meta.getSchool(acc.schoolId);
      const res = await Meta.deleteAccount(school, acc.id);
      if (!res.ok) { UI.toast(res.msg, 'err'); return; }
      UI.toast('Compte utilisateur supprimé.', 'ok');
      await renderAccounts(m, body, schools, selectedId);
    }, { title: 'Supprimer un compte utilisateur' });
  }

  // ---- Définition des niveaux d'accès par rôle (admin global) ----
  const PERM_LABELS = {
    'users.manage': 'Gestion des utilisateurs',
    'parametres.permissions': 'Permissions',
    'ecole.manage': 'École (établissement)', 'annees.manage': 'Années scolaires',
    'cycles.manage': 'Cycles', 'salles.manage': 'Salles', 'niveaux.manage': 'Niveaux',
    'classes.manage': 'Classes', 'eleves.manage': 'Élèves', 'cartes.manage': 'Cartes scolaires',
    'enseignants.manage': 'Enseignants', 'matieres.manage': 'Matières', 'affectations.manage': 'Affectations',
    'volumes.manage': 'Volumes horaires', 'pointage.manage': 'Pointage des cours', 'controle.heures': 'Contrôle des heures',
    'frais.manage': 'Frais scolaires', 'frais.pay': 'Encaisser les frais', 'salaires.manage': 'Salaires', 'honoraires.manage': 'Honoraires des enseignants',
    'emplois.manage': 'Gérer emplois du temps', 'emplois.view': 'Consulter emplois du temps',
    'notes.entry': 'Saisie des notes', 'notes.view': 'Consulter les notes',
    'bulletins.view': 'Consulter les bulletins', 'bulletins.print': 'Imprimer les bulletins',
    'dashboard.view': 'Tableau de bord',
    'passages.manage': 'Passages (promotion)',
    'personnel.manage': 'Gestion du personnel', 'depenses.manage': 'Dépenses & charges',
    'parametres.sauvegarde': 'Sauvegarde & restauration', 'parametres.synchro': 'Synchronisation',
    'parametres.journal': 'Journal d\'audit (consultation)', 'statistiques.view': 'Statistiques'
  };
  const PERM_ORDER = ['users.manage','parametres.permissions','ecole.manage','annees.manage',
    'cycles.manage','salles.manage','niveaux.manage','classes.manage',
    'eleves.manage','cartes.manage','enseignants.manage','matieres.manage','affectations.manage',
    'volumes.manage','pointage.manage','controle.heures',
    'frais.manage','frais.pay','salaires.manage','honoraires.manage','emplois.manage','emplois.view',
    'notes.entry','notes.view','bulletins.view','bulletins.print','dashboard.view','passages.manage','personnel.manage','depenses.manage',
    'parametres.sauvegarde','parametres.synchro','parametres.journal','statistiques.view'];

  async function openPermsManager() {
    if (!Meta.currentTenant()) { UI.toast('Connectez-vous d\'abord en COMPTE ADMIN.', 'err'); return; }
    const matrix = await Meta.getPermissions();
    const roles = await Auth.editableRoles();
    const headHtml = '<th>Rôle</th>' + PERM_ORDER.map((p) => '<th title="' + UI.esc(PERM_LABELS[p] || p) + '">' + UI.esc((p.split('.')[0][0] + (p.split('.')[1] || '')[0]).toUpperCase()) + '</th>').join('') + '<th>Accès complet</th>';
    const rows = roles.map((r) => {
      const rl = Auth.ROLES[r] || {};
      const cell = (p) => '<td><input type="checkbox" class="pm-cell" data-role="' + r + '" data-perm="' + p + '"' +
        ((matrix[r] || []).indexOf(p) >= 0 ? ' checked' : '') + '></td>';
      return '<tr><td><span class="badge ' + (rl.class || 'badge-gray') + '">' + UI.esc(rl.libelle || r) + '</span></td>' +
        PERM_ORDER.map(cell).join('') +
        '<td><button class="btn btn-sm btn-outline pm-all" data-role="' + r + '">Tout</button></td></tr>';
    }).join('');
    UI.prompt('Niveaux d\'accès par rôle', `
      <p class="hint" style="margin-bottom:10px">Cochez les accès accordés à chaque rôle. <b>Super Administrateur</b> conserve toujours un accès complet.</p>
      <div class="pm-scroll"><div class="table-wrap"><table class="tbl pm-tbl"><thead><tr>${headHtml}</tr></thead><tbody>${rows}</tbody></table></div></div>
    `, async (body) => {
      const next = {};
      (await Auth.editableRoles()).forEach((r) => {
        next[r] = PERM_ORDER.filter((p) => body.querySelector('.pm-cell[data-role="' + r + '"][data-perm="' + p + '"]').checked);
      });
      await Meta.savePermissions(next);
      Auth.setPermissions(next);
      UI.closeModal();
      UI.toast('Niveaux d\'accès par rôle mis à jour.', 'ok');
      return true;
    }, { size: 'modal modal-lg', okLabel: 'Enregistrer les accès' });
    const pm = document.getElementById('modal-root').lastElementChild;
    setTimeout(() => {
      pm.querySelectorAll('.pm-all').forEach((b) => b.onclick = () => {
        const r = b.dataset.role;
        pm.querySelectorAll('.pm-cell[data-role="' + r + '"]').forEach((c) => c.checked = true);
      });
    }, 30);
  }

  function quitApp() {
    if (window.GSBridge && window.GSBridge.isDesktop && window.GSBridge.isDesktop()) {
      try { window.GSBridge.quit(); } catch (e) { /* ignore */ }
      return;
    }
    try { window.close(); } catch (e) { /* ignore */ }
  }

  function bindStatic() {
    document.getElementById('btn-user-login').addEventListener('click', openAccessForm);
    document.getElementById('btn-admin-login').addEventListener('click', adminLoginForm);
    document.getElementById('btn-quit').addEventListener('click', quitApp);
    document.getElementById('btn-tenant-logout').addEventListener('click', () => { Meta.logoutTenant(); tenantUi(); renderSchools(); });
    document.getElementById('btn-lic-generator').addEventListener('click', () => {
      const t = Meta.currentTenant();
      if (!t) { UI.toast('Connectez-vous d\'abord en COMPTE ADMIN (global).', 'err'); return; }
      if (window.License && License.openGenerator) License.openGenerator();
      else UI.toast('Le générateur de licence est disponible dans l\'application installée.', 'warn');
    });
    document.getElementById('btn-tenant-edit').addEventListener('click', () => {
      const t = Meta.currentTenant();
      if (!t) { UI.toast('Connectez-vous en tant qu\'admin global.', 'err'); return; }
      UI.prompt('Modifier les identifiants du compte global', `
        <div class="field"><label>Nouvel identifiant</label><input id="te-user" value="${UI.esc(t.username || '')}" autocomplete="off" autocapitalize="none" autocorrect="off"></div>
        <div class="field"><label>Mot de passe actuel *</label><input id="te-cur" type="password" required autocomplete="new-password"></div>
        <div class="field"><label>Nouveau mot de passe</label><input id="te-new" type="password" autocomplete="new-password"></div>
        <div class="field"><label>Confirmation</label><input id="te-new2" type="password" autocomplete="new-password"></div>
      `, async (body) => {
        const cur = body.querySelector('#te-cur').value;
        const nw = body.querySelector('#te-new').value;
        const nw2 = body.querySelector('#te-new2').value;
        const username = body.querySelector('#te-user').value.trim();
        if (!cur) { UI.toast('Mot de passe actuel requis.', 'err'); return false; }
        if (nw) {
          if (nw.length < 4) { UI.toast('Le nouveau mot de passe doit contenir au moins 4 caractères.', 'err'); return false; }
          if (nw !== nw2) { UI.toast('Les nouveaux mots de passe ne correspondent pas.', 'err'); return false; }
        }
        if (!username) { UI.toast('Identifiant requis.', 'err'); return false; }
        const res = await Meta.updateTenant({ username, currentPassword: cur, newPassword: nw || undefined });
        if (!res.ok) { UI.toast(res.msg, 'err'); return false; }
        UI.closeModal(); UI.toast('Identifiants du compte global mis à jour.', 'ok'); tenantUi(); renderSchools();
        return true;
      }, { size: 'modal modal-sm' });
    });
    document.getElementById('btn-create-school').addEventListener('click', createSchoolPrompt);
    document.getElementById('btn-manage-accounts').addEventListener('click', openAccountsManager);
    document.getElementById('btn-manage-perms').addEventListener('click', openPermsManager);
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('login-error');
      err.classList.add('hidden');
      const un = document.getElementById('login-username').value.trim();
      const pw = document.getElementById('login-password').value;
      if (!un || !pw) { err.textContent = 'Saisissez votre identifiant et votre mot de passe.'; err.classList.remove('hidden'); return; }
      const res = await Auth.login(un, pw);
      if (!res.ok) { err.textContent = res.msg; err.classList.remove('hidden'); return; }
      await showShell();
    });
    document.getElementById('btn-logout').addEventListener('click', showMeta);
    document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      if (sb) sb.classList.toggle('collapsed');
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.shiftKey && ev.key && ev.key.toLowerCase() === 'a') {
        ev.preventDefault();
        const b = document.getElementById('btn-admin-login');
        if (!b) return;
        const hidden = b.classList.contains('hidden');
        b.classList.toggle('hidden', !hidden);
        UI.toast(hidden ? 'Bouton « COMPTE ADMIN (global) » affiché.' : 'Bouton « COMPTE ADMIN (global) » masqué.', hidden ? 'ok' : 'err');
      }
    }, true);
    // Sur mobile/pavé tactile : 5 appuis rapides sur le logo GS révèlent
    // le bouton « COMPTE ADMIN (global) » (équivalent du raccourci Ctrl+Shift+A).
    (function () {
      const el = document.getElementById('meta-logo');
      if (!el) return;
      let taps = 0, last = 0;
      el.addEventListener('click', () => {
        const now = Date.now();
        taps = (now - last < 1500) ? taps + 1 : 1;
        last = now;
        if (taps < 5) return;
        taps = 0;
        const b = document.getElementById('btn-admin-login');
        if (!b) return;
        const hidden = b.classList.contains('hidden');
        b.classList.toggle('hidden', !hidden);
        UI.toast(hidden ? 'Bouton « COMPTE ADMIN (global) » affiché.' : 'Bouton « COMPTE ADMIN (global) » masqué.', hidden ? 'ok' : 'err');
      });
    })();
  }

  function init() {
    bindStatic();
    setScreens('screen-meta');
    renderSchools();
    tenantUi();
  }

  NS.init = init;
  NS.renderSchools = renderSchools;
  NS.showLogin = showLogin;
  NS.showMeta = showMeta;
  NS.refreshBranding = refreshBranding;
  NS.afterSync = afterSync;
  NS.accountsModal = null;
  return NS;
})();

document.addEventListener('DOMContentLoaded', () => {
  Meta.ready()
    .then(async () => {
      const perms = await Meta.getPermissions();
      Auth.setPermissions(perms);
      window.App.init();
    })
    .catch((e) => {
      console.error(e);
      const err = document.getElementById('login-error');
      if (err) { err.textContent = 'Erreur d\'initialisation : ' + e.message; err.classList.remove('hidden'); }
    });
});
