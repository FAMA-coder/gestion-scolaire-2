/* ============================================================
   parametres.js — Paramètres & Administration (adapté au modèle
   scolaire). Onglets :
     • Établissement : identité (nom, slogan, adresse, tél, email, logo)
     • Utilisateurs  : comptes de l'établissement courant
     • Paiement      : options de base des paiements (devise, décimales, modes)
     • Permissions   : niveaux d'accès par rôle (système + personnalisés)
     • Sauvegarde    : diagnostic stockage, sauvegarde/restauration, exports CSV
     • Journal       : journal d'audit
   ============================================================ */
window.Parametres = (function () {
  let tab = 'etablissement';

  function setPageTitle(t) { document.getElementById('topbar-title').textContent = t; }

  function show(root) {
    setPageTitle('Paramètres & Administration');
    root.innerHTML =
      '<div class="tabbar">' +
        '<button class="tab" data-tab="etablissement">Établissement</button>' +
        '<button class="tab" data-tab="utilisateurs">Utilisateurs</button>' +
        '<button class="tab" data-tab="paiement">Paiement</button>' +
        (Auth.can('parametres.permissions') ? '<button class="tab" data-tab="permissions">Permissions</button>' : '') +
        '<button class="tab" data-tab="sauvegarde">Sauvegarde</button>' +
        '<button class="tab" data-tab="journal">Journal</button>' +
      '</div>' +
      '<div class="tabbar-content" style="margin-top:14px"></div>';
    root.querySelectorAll('.tab').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; show(root); }; });
    if (!Auth.can('parametres.permissions') && tab === 'permissions') tab = 'etablissement';
    wrap(root);
  }

  function content(root) { return root.querySelector('.tabbar-content'); }

  async function wrap(root) {
    const c = content(root);
    c.classList.toggle('active', true);
    root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    c.innerHTML = '<div class="empty">Chargement…</div>';
    if (tab === 'etablissement') await renderEtablissement(c);
    else if (tab === 'utilisateurs') await renderUtilisateurs(c, root);
    else if (tab === 'paiement') await renderPaiement(c);
    else if (tab === 'permissions') {
      if (Auth.can('parametres.permissions')) await renderPermissions(c, root);
      else { tab = 'etablissement'; c.innerHTML = '<div class="empty">Accès refusé pour votre rôle.</div>'; }
    }
    else if (tab === 'sauvegarde') await renderSauvegarde(c);
    else await renderJournal(c);
    return c;
  }

  // ================= ÉTABLISSEMENT =================
  async function renderEtablissement(c) {
    const eco = await DB.get('ecole', 1);
    const d = eco || {};
    const u = Auth.currentUser();
    const isSuper = !!(u && u.role === 'super_admin');
    if (!isSuper) {
      const annexes = await DB.getAll('annees');
      const annee = (annexes || []).find((a) => Number(a.id) === Number(d.anneeEnCoursId));
      const typeLib = { fondamental: 'Fondamental (signature : Directeur)', lycee: 'Secondaire / Lycée (signature : Proviseur)', superieur: 'Supérieur / Université (signature : Doyen / Secrétaire Général)' };
      c.innerHTML =
        '<div class="card" style="padding:16px">' +
          '<div class="card-title" style="margin-bottom:14px">Identité de l\'établissement</div>' +
          '<div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">' +
            (d.logo ? '<div class="login-logo" style="width:70px;height:70px;margin:0;overflow:hidden"><img src="' + d.logo + '" style="max-height:70px"></div>' : '<div class="login-logo" style="width:70px;height:70px;margin:0">GS</div>') +
            '<div><b>' + UI.esc(d.nom || '—') + '</b>' + (d.slogan ? '<div style="opacity:.7">' + UI.esc(d.slogan) + '</div>' : '') + '</div>' +
          '</div>' +
          (d.adresse ? '<p><b>Adresse :</b> ' + UI.esc(d.adresse) + '</p>' : '') +
          (d.tel ? '<p><b>Téléphone :</b> ' + UI.esc(d.tel) + '</p>' : '') +
          (d.email ? '<p><b>Email :</b> ' + UI.esc(d.email) + '</p>' : '') +
          (d.type ? '<p><b>Type d\'établissement :</b> ' + UI.esc(typeLib[d.type] || d.type) + '</p>' : '') +
          (d.directeur ? '<p><b>Directeur(trice) / Fondateur :</b> ' + UI.esc(d.directeur) + '</p>' : '') +
          '<p><b>Année scolaire en cours :</b> ' + UI.esc(annee ? (annee.libelle || annee.nom) : '—') + '</p>' +
        '</div>';
      return;
    }
    const thumb = d.logo ? '<img src="' + d.logo + '" style="max-height:70px;border:1px solid var(--border);border-radius:6px;padding:4px;background:#fff">' : '<span class="hint">Aucun logo</span>';
    c.innerHTML =
      '<div class="card" style="padding:16px">' +
        '<div class="card-title" style="margin-bottom:14px">Identité de l\'établissement</div>' +
        '<div class="row">' +
          '<div class="field"><label>Nom *</label><input id="pe-nom" value="' + UI.esc(d.nom || '') + '" required></div>' +
          '<div class="field"><label>Slogan</label><input id="pe-slogan" value="' + UI.esc(d.slogan || '') + '"></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>Adresse</label><input id="pe-adresse" value="' + UI.esc(d.adresse || '') + '"></div>' +
          '<div class="field"><label>Téléphone</label><input id="pe-tel" value="' + UI.esc(d.tel || '') + '"></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>Email</label><input id="pe-email" type="email" value="' + UI.esc(d.email || '') + '"></div>' +
          '<div class="field"><label>Année scolaire en cours</label><select id="pe-annee"></select></div>' +
        '</div>' +
        '<div class="field"><label>Logo</label><div style="display:flex;gap:12px;align-items:center">' +
          '<input type="file" id="pe-logo" accept="image/*"><span id="pe-logo-preview">' + thumb + '</span>' +
        '</div></div>' +
        '<div class="field" style="text-align:right"><button class="btn btn-primary" id="pe-save">Enregistrer</button></div>' +
      '</div>';
    const annees = await DB.getAll('annees');
    const sel = c.querySelector('#pe-annee');
    sel.innerHTML = '<option value="">— Choisir —</option>' + (annees || []).map((a) =>
      '<option value="' + a.id + '"' + (Number(d.anneeEnCoursId) === Number(a.id) ? ' selected' : '') + '>' + UI.esc(a.libelle || a.nom) + '</option>').join('');
    c.querySelector('#pe-logo').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { UI.toast('Image trop volumineuse (max 2 Mo).', 'err'); e.target.value = ''; return; }
      try {
        const url = await UI.fileToDataUrl(f);
        document.getElementById('pe-logo-preview').innerHTML = '<img src="' + url + '" style="max-height:70px;border:1px solid var(--border);border-radius:6px;padding:4px;background:#fff">';
      } catch (ex) { UI.toast('Impossible de lire l\'image.', 'err'); }
    });
    c.querySelector('#pe-save').onclick = async () => {
      const nom = c.querySelector('#pe-nom').value.trim();
      if (!nom) { UI.toast('Le nom est requis.', 'err'); return; }
      const eco = (await DB.get('ecole', 1)) || { id: 1 };
      eco.nom = nom;
      eco.slogan = c.querySelector('#pe-slogan').value.trim();
      eco.adresse = c.querySelector('#pe-adresse').value.trim();
      eco.tel = c.querySelector('#pe-tel').value.trim();
      eco.email = c.querySelector('#pe-email').value.trim();
      const y = c.querySelector('#pe-annee').value;
      eco.anneeEnCoursId = y ? Number(y) : null;
      const logoEl = c.querySelector('#pe-logo');
      if (logoEl.files && logoEl.files[0]) {
        try { eco.logo = await UI.fileToDataUrl(logoEl.files[0]); } catch (e) { /* ignore */ }
      }
      await DB.put('ecole', eco);
      await Auth.log('Modification', 'parametres', 'Identité de l\'établissement');
      try { window.App.refreshBranding(); } catch (e) { /* ignore */ }
      UI.toast('Identité de l\'établissement enregistrée.', 'ok');
    };
  }

  // ================= UTILISATEURS =================
  async function renderUtilisateurs(c, root) {
    const users = await DB.getAll('users');
    const canManage = Auth.can('users.manage');
    const me = Auth.currentUser();
    const hideRow = (u) => (u.role === 'super_admin' && !(me && me.id === u.id)) ||
      (!(me && Auth.isPrincipalAdmin(me)) && Auth.isPrincipalAdmin(u));
    const visCount = users.filter((u) => !hideRow(u)).length;
    c.innerHTML =
      '<div class="bar" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">' +
        '<span class="hint">' + visCount + ' compte(s) dans cet établissement</span>' +
        (canManage ? '<button class="btn btn-primary" id="pu-add">+ Nouvel utilisateur</button>' : '') +
      '</div>' +
      '<div id="pu-tbl"></div>' +
      (canManage ? '' : '<div class="empty">Votre rôle ne permet pas de gérer les utilisateurs.</div>');
    if (canManage) c.querySelector('#pu-add').onclick = () => userForm(root, null);
    const roleMap = await roleLabels();
    const rows = users.map((u, i) => {
      if (hideRow(u)) return null;
      const rl = Auth.ROLES[u.role] || {};
      return '<tr>' +
        '<td><strong>' + UI.esc((u.nom || '') + ' ' + (u.prenom || '')) + '</strong></td>' +
        '<td>' + UI.esc(u.username) + '</td>' +
        '<td><span class="badge ' + (rl.class || 'badge-gray') + '">' + UI.esc(roleMap[u.role] || Auth.roleName(u.role) || u.role) + '</span></td>' +
        '<td>' + (u.actif === false ? '<span class="badge badge-gray">Inactif</span>' : '<span class="badge badge-ok">Actif</span>') + '</td>' +
        (canManage ? '<td class="actions-cell"><button class="btn btn-sm btn-outline" data-edit="' + i + '">Modifier</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + i + '">Suppr.</button></td>' : '') +
      '</tr>';
    }).join('');
    c.querySelector('#pu-tbl').innerHTML = UI.table(['Nom', 'Identifiant', 'Rôle', 'Statut', 'Actions'].slice(0, canManage ? 5 : 4), rows || UI.empty(4));
    c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => userForm(root, users[Number(b.dataset.edit)]));
    c.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => deleteUser(root, users[Number(b.dataset.del)]));
  }

  async function roleLabels() {
    const map = {};
    Object.keys(Auth.ROLES).forEach((r) => { map[r] = Auth.ROLES[r].libelle; });
    try { (await Meta.getAllRoles()).forEach((r) => { map[r.key] = r.nom; }); } catch (e) { /* ignore */ }
    return map;
  }
  async function roleOptions(selected) {
    const opts = [];
    const isSuper = Auth.isSuperAdmin();
    Object.keys(Auth.ROLES).sort((a, b) => Auth.ROLES[a].ordre - Auth.ROLES[b].ordre).forEach((r) => {
      if (r === 'super_admin' && !isSuper && String(selected) !== 'super_admin') return;
      opts.push('<option value="' + r + '"' + (selected === r ? ' selected' : '') + '>' + UI.esc(Auth.ROLES[r].libelle) + '</option>');
    });
    try {
      (await Meta.getAllRoles()).forEach((r) => {
        opts.push('<option value="' + r.key + '"' + (selected === r.key ? ' selected' : '') + '>' + UI.esc(r.nom) + '</option>');
      });
    } catch (e) { /* ignore */ }
    return opts.join('');
  }

  async function userForm(root, acc) {
    acc = acc || {};
    const isNew = !acc.id;
    UI.prompt(isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur', `
      <div class="row">
        <div class="field"><label>Nom *</label><input id="uf-nom" value="${UI.esc(acc.nom || '')}" required></div>
        <div class="field"><label>Prénom</label><input id="uf-prenom" value="${UI.esc(acc.prenom || '')}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Identifiant *</label><input id="uf-username" value="${UI.esc(acc.username || '')}" required></div>
        <div class="field"><label>Rôle *</label><select id="uf-role">${await roleOptions(acc.role || '')}</select></div>
      </div>
      <div class="field"><label>${isNew ? 'Mot de passe *' : 'Nouveau mot de passe (vide = inchangé)'}</label><input id="uf-pwd" type="password"${isNew ? ' required' : ''}></div>
      <div class="field"><label><input type="checkbox" id="uf-actif"${acc.actif !== false ? ' checked' : ''}> Compte actif</label></div>
    `, async (body) => {
      const nom = body.querySelector('#uf-nom').value.trim();
      const prenom = body.querySelector('#uf-prenom').value.trim();
      const username = body.querySelector('#uf-username').value.trim();
      const role = body.querySelector('#uf-role').value;
      const pwd = body.querySelector('#uf-pwd').value;
      const actif = body.querySelector('#uf-actif').checked;
      if (!nom || !username || !role) { UI.toast('Renseignez nom, identifiant et rôle.', 'err'); return false; }
      if (role === 'super_admin' && !Auth.isSuperAdmin()) { UI.toast('Seul le super administrateur peut créer un compte super administrateur.', 'err'); return false; }
      if (!isNew && acc.role === 'super_admin' && !Auth.isSuperAdmin()) { UI.toast('Vous ne pouvez pas modifier un compte super administrateur.', 'err'); return false; }
      const all = await DB.getAll('users');
      if ((isNew ? all.some((u) => String(u.username).toLowerCase() === username.toLowerCase())
          : all.some((u) => u.id !== acc.id && String(u.username).toLowerCase() === username.toLowerCase()))) {
        UI.toast('Cet identifiant existe déjà.', 'err'); return false;
      }
      if (isNew) {
        if (!pwd) { UI.toast('Mot de passe requis.', 'err'); return false; }
        const user = {
          nom: nom, prenom: prenom, username: username, role: role, actif: actif,
          salt: AUTH_ENV.salt, passwordHash: AUTH_ENV.sha256(pwd + AUTH_ENV.salt),
          dateCreation: new Date().toISOString()
        };
        await DB.put('users', user);
        await Auth.log('Création', 'parametres', 'Utilisateur ' + username);
      } else {
        const cur = acc;
        if (pwd && pwd.length < 4) { UI.toast('Le mot de passe doit contenir au moins 4 caractères.', 'err'); return false; }
        const cUser = Auth.currentUser();
        if (cUser && cUser.id === acc.id && actif === false) { UI.toast('Vous ne pouvez pas désactiver votre propre compte.', 'err'); return false; }
        cur.nom = nom; cur.prenom = prenom; cur.username = username; cur.role = role; cur.actif = actif;
        if (pwd) cur.passwordHash = AUTH_ENV.sha256(pwd + (cur.salt || AUTH_ENV.salt));
        await DB.put('users', cur);
        await Auth.log('Modification', 'parametres', 'Utilisateur ' + username);
      }
      UI.closeModal();
      UI.toast(isNew ? 'Utilisateur créé.' : 'Utilisateur modifié.', 'ok');
      wrap(root);
      return true;
    }, { size: 'modal' });
  }

  async function deleteUser(root, acc) {
    UI.confirm('Supprimer le compte « ' + (acc.nom + ' ' + (acc.prenom || '')).trim() + ' » (' + acc.username + ') ?', async () => {
      const cUser = Auth.currentUser();
      if (cUser && cUser.id === acc.id) { UI.toast('Vous ne pouvez pas supprimer votre propre compte.', 'err'); return; }
      await DB.del('users', acc.id);
      await Auth.log('Suppression', 'parametres', 'Utilisateur ' + acc.username);
      UI.toast('Compte utilisateur supprimé.', 'ok');
      wrap(root);
    }, { title: 'Supprimer un utilisateur' });
  }

  // ================= PAIEMENT =================
  const PAY_DEFAULTS = { devise: 'FCFA', decimales: 0, modes: ['Espèces', 'Chèque', 'Virement bancaire', 'Mobile Money'] };
  async function renderPaiement(c) {
    const eco = (await DB.get('ecole', 1)) || {};
    const cfg = Object.assign({}, PAY_DEFAULTS, eco.paiement || {});
    c.innerHTML =
      '<div class="card" style="padding:16px;max-width:640px">' +
        '<div class="card-title" style="margin-bottom:6px">Options de paiement</div>' +
        '<p class="hint" style="margin-bottom:14px">Options de base appliquées aux frais scolaires, encaissements, salaires et reçus.</p>' +
        '<div class="row">' +
          '<div class="field"><label>Devise</label><input id="pp-devise" value="' + UI.esc(cfg.devise || 'FCFA') + '" placeholder="Ex : FCFA, €, $"></div>' +
          '<div class="field"><label>Affichage des montants</label><select id="pp-dec">' +
            '<option value="0"' + ((cfg.decimales == null ? 0 : cfg.decimales) === 0 ? ' selected' : '') + '>Sans décimales</option>' +
            '<option value="2"' + (cfg.decimales === 2 ? ' selected' : '') + '>Avec 2 décimales</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>Modes de paiement acceptés</label>' +
          '<div id="pp-modes"></div>' +
          '<div style="display:flex;gap:8px;margin-top:6px"><input id="pp-newmode" placeholder="Nouveau mode (Ex : Carte)" style="flex:1"><button type="button" class="btn btn-outline" id="pp-addmode">+ Ajouter</button></div>' +
          '<small class="hint">Ces modes apparaissent lors de l\'encaissement des frais et sur les reçus.</small>' +
        '</div>' +
        '<div class="field" style="text-align:right;margin-top:10px"><button class="btn btn-primary" id="pp-savepay">Enregistrer</button></div>' +
      '</div>';
    const list = c.querySelector('#pp-modes');
    const modes = (cfg.modes || []).slice();
    const renderModes = () => {
      list.innerHTML = modes.length ? modes.map((m, i) =>
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
          '<input value="' + UI.esc(m) + '" data-mi="' + i + '" style="flex:1">' +
          '<button type="button" class="btn btn-sm btn-danger" data-mdel="' + i + '">×</button></div>').join('')
        : '<div class="empty">Aucun mode défini. Ajoutez-en un ci-dessous.</div>';
      list.querySelectorAll('[data-mdel]').forEach((b) => b.onclick = () => { modes.splice(Number(b.dataset.mdel), 1); renderModes(); });
    };
    renderModes();
    c.querySelector('#pp-addmode').onclick = () => {
      const v = c.querySelector('#pp-newmode').value.trim();
      if (!v) { UI.toast('Saisissez le nom du mode.', 'err'); return; }
      if (modes.some((m) => String(m).toLowerCase() === v.toLowerCase())) { UI.toast('Ce mode existe déjà.', 'warn'); return; }
      modes.push(v); c.querySelector('#pp-newmode').value = ''; renderModes();
    };
    c.querySelector('#pp-savepay').onclick = async () => {
      const devise = c.querySelector('#pp-devise').value.trim() || 'FCFA';
      const decimales = Number(c.querySelector('#pp-dec').value) === 2 ? 2 : 0;
      const collected = [];
      list.querySelectorAll('input[data-mi]').forEach((inp) => {
        const v = inp.value.trim();
        if (v && !collected.some((x) => String(x).toLowerCase() === v.toLowerCase())) collected.push(v);
      });
      const e = (await DB.get('ecole', 1)) || { id: 1 };
      e.paiement = { devise: devise, decimales: decimales, modes: collected };
      await DB.put('ecole', e);
      window.PAIEMENT = Object.assign({}, PAY_DEFAULTS, e.paiement);
      await Auth.log('Modification', 'parametres', 'Options de paiement');
      try { window.App.refreshBranding(); } catch (ex) { /* ignore */ }
      UI.toast('Options de paiement enregistrées.', 'ok');
    };
  }

  // ================= PERMISSIONS =================
  const PERM_LABELS = {
    'users.manage': 'Gestion des utilisateurs', 'parametres.permissions': 'Permissions',
    'ecole.manage': 'École & années scolaires',
    'cycles.manage': 'Cycles', 'salles.manage': 'Salles', 'niveaux.manage': 'Niveaux',
    'classes.manage': 'Classes', 'eleves.manage': 'Élèves', 'enseignants.manage': 'Enseignants',
    'matieres.manage': 'Matières', 'affectations.manage': 'Affectations',
    'frais.manage': 'Frais scolaires', 'frais.pay': 'Encaisser les frais', 'salaires.manage': 'Salaires',
    'emplois.manage': 'Gérer emplois du temps', 'emplois.view': 'Consulter emplois du temps',
    'notes.entry': 'Saisie des notes', 'notes.view': 'Consulter les notes',
    'bulletins.view': 'Consulter les bulletins', 'bulletins.print': 'Imprimer les bulletins',
    'dashboard.view': 'Tableau de bord', 'passages.manage': 'Passages (promotion)',
    'personnel.manage': 'Gestion du personnel', 'depenses.manage': 'Dépenses & charges'
  };
  const ORDER = ['users.manage','parametres.permissions','ecole.manage','cycles.manage','salles.manage','niveaux.manage','classes.manage',
    'eleves.manage','enseignants.manage','matieres.manage','affectations.manage',
    'frais.manage','frais.pay','salaires.manage','emplois.manage','emplois.view',
    'notes.entry','notes.view','bulletins.view','bulletins.print','dashboard.view','passages.manage','personnel.manage','depenses.manage'];

  async function renderPermissions(c, root) {
    const matrix = await Meta.getPermissions();
    const roles = [];
    Object.keys(Auth.ROLES).sort((a, b) => Auth.ROLES[a].ordre - Auth.ROLES[b].ordre).forEach((r) => roles.push(r));
    try { (await Meta.getAllRoles()).forEach((r) => roles.push(r.key)); } catch (e) { /* ignore */ }

    const roleName = (r) => Auth.ROLES[r] ? Auth.ROLES[r].libelle : r;
    const headHtml = '<th class="pm-fixed">Module</th>' + ORDER.map((p) => '<th title="' + UI.esc(PERM_LABELS[p] || p) + '">' + UI.esc((PERM_LABELS[p] || p)) + '</th>').join('') + '<th>Accès complet</th>';
    const rows = roles.map((r) => {
      const rl = Auth.ROLES[r] || {};
      const cell = (p) => '<td><input type="checkbox" class="pm-cell" data-role="' + r + '" data-perm="' + p + '"' +
        ((matrix[r] || []).indexOf(p) >= 0 ? ' checked' : '') + '></td>';
      return '<tr><td class="pm-fixed"><strong>' + UI.esc(roleName(r)) + (rl.class ? '' : ' <span class="badge badge-info">perso</span>') + '</strong></td>' +
        ORDER.map(cell).join('') +
        '<td><button class="btn btn-sm btn-outline pm-all" data-role="' + r + '">Tout</button></td></tr>';
    }).join('');

    c.innerHTML =
      '<div class="bar" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div><span class="hint">Accès par rôle. <b>Super Administrateur</b> garde toujours un accès complet. Rôles « perso » = personnalisés.</span></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-outline" id="pp-add-role">+ Ajouter un rôle</button>' +
          '<button class="btn btn-outline" id="pp-reset">Retablir les défauts</button>' +
          '<button class="btn btn-primary" id="pp-save">Enregistrer les accès</button>' +
        '</div>' +
      '</div>' +
      '<div class="pm-scroll pm-grid"><table class="tbl pm-tbl"><thead><tr>' + headHtml + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div id="pp-custom" style="margin-top:12px"></div>';
    await renderCustomRoles(c, root);
    c.querySelector('#pp-save').onclick = async () => {
      const next = {};
      roles.forEach((r) => {
        next[r] = ORDER.filter((p) => c.querySelector('.pm-cell[data-role="' + r + '"][data-perm="' + p + '"]').checked);
      });
      await Meta.savePermissions(next);
      Auth.setPermissions(next);
      await Auth.log('Modification', 'parametres', 'Permissions des rôles');
      UI.toast('Niveaux d\'accès enregistrés.', 'ok');
    };
    c.querySelector('#pp-reset').onclick = async () => {
      const ok = await UI.confirm('Rétablir les accès par défaut pour tous les rôles ?', async () => {
        const defs = Auth.permsOrDefault();
        await Meta.savePermissions(defs);
        Auth.setPermissions(defs);
        UI.closeModal(); UI.toast('Accès par défaut rétablis.', 'ok');
        wrap(root);
      }, { title: 'Rétablir les défauts' });
    };
    c.querySelector('#pp-add-role').onclick = async () => {
      UI.prompt('Ajouter un rôle personnalisé', '<div class="field"><label>Nom du rôle *</label><input id="nr-nom" required placeholder="Ex : Bursar, Délégué, …"></div>', async (body) => {
        const nom = body.querySelector('#nr-nom').value.trim();
        if (!nom) { UI.toast('Nom requis.', 'err'); return false; }
        const res = await Meta.addCustomRole(nom);
        if (!res.ok) { UI.toast(res.msg, 'err'); return false; }
        await Auth.log('Création', 'parametres', 'Rôle ' + res.key + ' (' + nom + ')');
        UI.closeModal(); UI.toast('Rôle « ' + nom + ' » créé.', 'ok');
        wrap(root);
        return true;
      }, { size: 'modal modal-sm' });
    };
    c.querySelectorAll('.pm-all').forEach((b) => b.onclick = () => {
      const r = b.dataset.role;
      c.querySelectorAll('.pm-cell[data-role="' + r + '"]').forEach((x) => x.checked = true);
    });
  }

  async function renderCustomRoles(c, root) {
    const box = c.querySelector('#pp-custom');
    let customs = [];
    try { customs = await Meta.getAllRoles(); } catch (e) { /* ignore */ }
    if (!customs.length) { box.innerHTML = '<div class="empty">Aucun rôle personnalisé. Utilisez « + Ajouter un rôle ».</div>'; return; }
    box.innerHTML = '<div class="card-title" style="margin-bottom:8px;font-size:14px">Rôles personnalisés</div>' +
      customs.map((r) =>
        '<div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:6px;padding:6px 10px;margin-bottom:6px;max-width:560px">' +
        '<span><strong>' + UI.esc(r.nom) + '</strong> <span class="hint">(' + UI.esc(r.key) + ')</span></span>' +
        '<span style="display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-outline" data-rn="' + r.key + '">Renommer</button>' +
          '<button class="btn btn-sm btn-danger" data-rd="' + r.key + '">Supprimer</button>' +
        '</span></div>').join('');
    box.querySelectorAll('[data-rn]').forEach((b) => b.onclick = async () => {
      const r = customs.find((x) => x.key === b.dataset.rn);
      UI.prompt('Renommer le rôle', '<div class="field"><label>Nom *</label><input id="rr-nom" value="' + UI.esc(r ? r.nom : '') + '" required></div>', async (body) => {
        const nom = body.querySelector('#rr-nom').value.trim();
        if (!nom) { UI.toast('Nom requis.', 'err'); return false; }
        await Meta.renameCustomRole(b.dataset.rn, nom);
        UI.closeModal(); UI.toast('Rôle renommé.', 'ok');
        wrap(root);
        return true;
      }, { size: 'modal modal-sm' });
    });
    box.querySelectorAll('[data-rd]').forEach((b) => b.onclick = async () => {
      const res = await Meta.deleteCustomRole(b.dataset.rd);
      if (!res.ok) { UI.toast(res.msg, 'err'); return; }
      await Auth.log('Suppression', 'parametres', 'Rôle ' + b.dataset.rd);
      UI.toast('Rôle supprimé.', 'ok');
      wrap(root);
    });
  }

  // ================= SAUVEGARDE =================
  async function renderSauvegarde(c) {
    c.innerHTML =
      '<div class="card" style="padding:16px;margin-bottom:14px">' +
        '<div class="card-title" style="margin-bottom:10px">Stockage du navigateur</div>' +
        '<div id="ps-storage" style="font-size:14px;line-height:1.8" class="hint">Chargement…</div>' +
        '<div style="margin-top:8px"><button class="btn btn-outline" id="ps-refresh">⟳ Actualiser</button> <button class="btn btn-outline" id="ps-persist">🔒 Activer le stockage persistant</button></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="card" style="padding:16px;flex:1">' +
          '<div class="card-title" style="margin-bottom:8px">Sauvegarde</div>' +
          '<p class="hint" style="margin-bottom:12px">Exporte toutes les données (écoles, comptes, notes, élèves, finances…) dans un fichier JSON à conserver à côté de l\'application.</p>' +
          '<button class="btn btn-ok" id="ps-export">⬇ Exporter la sauvegarde (.json)</button>' +
        '</div>' +
        '<div class="card" style="padding:16px;flex:1">' +
          '<div class="card-title" style="margin-bottom:8px">Restauration</div>' +
          '<p class="hint" style="margin-bottom:12px">Importe un fichier de sauvegarde JSON. <b>Remplace</b> les données actuelles.</p>' +
          '<button class="btn btn-primary" id="ps-import">⬆ Restaurer depuis un fichier</button>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:16px;margin-top:14px">' +
        '<div class="card-title" style="margin-bottom:8px">Exports CSV</div>' +
        '<p class="hint" style="margin-bottom:12px">Génère des fichiers CSV (ouvrables dans Excel) de l\'établissement courant.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap" id="ps-exports"></div>' +
      '</div>' +
      '<div class="card" style="padding:16px;margin-top:14px">' +
        '<div class="card-title" style="margin-bottom:8px" id="ab-title">Sauvegarde automatique</div>' +
        '<div id="ab-box"></div>' +
      '</div>';
    const storage = c.querySelector('#ps-storage');
    async function refreshStorage() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          const used = ((est.usage || 0) / 1048576), quota = ((est.quota || 0) / 1048576);
          const pct = quota > 0 ? ((used / quota) * 100).toFixed(1) : '0';
          let persisted = 'Indéterminé';
          if (navigator.storage.persisted) persisted = (await navigator.storage.persisted()) ? 'Oui' : 'Non';
          storage.innerHTML =
            '<div><b>Espace utilisé :</b> ' + used.toFixed(2) + ' Mo</div>' +
            '<div><b>Quota disponible :</b> ' + quota.toFixed(1) + ' Mo</div>' +
            '<div><b>Pourcentage utilisé :</b> ' + pct + ' %</div>' +
            '<div><b>Stockage persistant :</b> ' + persisted + '</div>';
        } else storage.innerHTML = '<span class="hint">API de mesure du stockage non disponible.</span>';
      } catch (e) { storage.innerHTML = '<span class="hint">Impossible de lire les informations de stockage : ' + UI.esc(e.message) + '</span>'; }
    }
    await refreshStorage();
    c.querySelector('#ps-refresh').onclick = refreshStorage;
    c.querySelector('#ps-persist').onclick = async () => {
      try {
        if (navigator.storage && navigator.storage.persist) {
          const granted = await navigator.storage.persist();
          UI.toast(granted ? 'Stockage persistant activé.' : 'Refusé par le navigateur.', granted ? 'ok' : 'warn');
        } else UI.toast('Stockage persistant non supporté.', 'warn');
        refreshStorage();
      } catch (e) { UI.toast('Erreur : ' + e.message, 'err'); }
    };
    c.querySelector('#ps-export').onclick = async () => {
      try {
        const data = await Store.saveToDisk();
        await Auth.log('Sauvegarde', 'parametres', 'Export JSON (' + (data.schools || []).length + ' école(s))');
        UI.toast('Sauvegarde exportée.', 'ok');
      } catch (e) { UI.toast('Erreur d\'export : ' + e.message, 'err'); }
    };
    c.querySelector('#ps-import').onclick = () => {
      UI.prompt('Restaurer une sauvegarde', `
        <div class="field"><label>Fichier .json *</label><input type="file" id="ps-file" accept="application/json,.json" required></div>
        <p class="hint">La restauration <b>remplacera</b> toutes les données actuelles.</p>
      `, async (body) => {
        const file = body.querySelector('#ps-file').files && body.querySelector('#ps-file').files[0];
        if (!file) { UI.toast('Choisissez un fichier de sauvegarde.', 'err'); return false; }
        UI.closeModal();
        UI.confirm('Remplacer TOUTES les données actuelles par cette sauvegarde ? Action irréversible.', async () => {
          try {
            const data = await Store.restoreFromFile(file);
            await Auth.log('Restauration', 'parametres', 'Restauration (' + (data.schools || []).length + ' école(s))');
            UI.toast('Restauration terminée.', 'ok');
          } catch (e) { UI.toast('Erreur de restauration : ' + e.message, 'err'); }
        }, { title: 'Confirmer la restauration' });
        return true;
      }, { size: 'modal modal-sm' });
    };
    const exportDefs = [
      { label: 'Élèves', fn: exportEleves },
      { label: 'Enseignants', fn: exportEnseignants },
      { label: 'Types de frais', fn: exportTypesFrais },
      { label: 'Encaissements de frais', fn: exportFrais },
      { label: 'Salaires', fn: exportSalaires },
      { label: 'Notes', fn: exportNotes }
    ];
    c.querySelector('#ps-exports').innerHTML = exportDefs.map((d, i) =>
      '<button class="btn btn-outline" data-ex="' + i + '">' + UI.esc(d.label) + '</button>').join('');
    c.querySelectorAll('[data-ex]').forEach((b) => b.onclick = async () => {
      try { await exportDefs[Number(b.dataset.ex)].fn(); } catch (e) { UI.toast('Erreur d\'export : ' + e.message, 'err'); }
    });
    renderAutoBackup(c);
  }

  // ================= SAUVEGARDE AUTOMATIQUE =================
  const AB_KEY = 'gs_auto_backup';
  function abLoad() {
    try {
      const raw = localStorage.getItem(AB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { enabled: false, value: 1, unit: 'jour', folder: '', lastRun: null };
  }
  function abSave(cfg) {
    try { localStorage.setItem(AB_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  function abIntervalMs(cfg) {
    const v = Math.max(1, cfg.value || 1);
    switch (cfg.unit) {
      case 'heure': return v * 3600000;
      case 'semaine': return v * 604800000;
      case 'mois': return v * 2629800000;    // ~30,44 jours
      case 'annee': return v * 31557600000;  // ~365,25 jours
      default: return v * 86400000;          // jour
    }
  }
  async function abRunNow(quiet) {
    try {
      const cfg = abLoad();
      await DB.ready();
      const data = await Store.exportData();
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
      const filename = 'gestion-scolaire-sauvegarde-' + stamp + '.json';
      const content = JSON.stringify(data, null, 2);
      const bridge = window.GSBridge;
      if (bridge && bridge.available && bridge.currentLocation && bridge.currentLocation()) {
        const path = await bridge.saveFile(filename, content);
        cfg.lastRun = new Date().toISOString();
        abSave(cfg);
        await Auth.log('Sauvegarde auto', 'parametres', filename);
        if (!quiet) UI.toast('Sauvegarde automatique écrite : ' + path, 'ok');
        else UI.toast('Sauvegarde automatique effectuée.', 'ok');
      } else {
        Store.downloadJSON(data, filename);
        cfg.lastRun = new Date().toISOString();
        abSave(cfg);
        await Auth.log('Sauvegarde auto', 'parametres', filename);
        if (!quiet) UI.toast('Sauvegarde automatique téléchargée.', 'ok');
      }
      return true;
    } catch (e) {
      if (quiet) return false;
      UI.toast('Erreur de sauvegarde automatique : ' + e.message, 'err');
      return false;
    }
  }
  async function abCheckDue() {
    const cfg = abLoad();
    if (!cfg.enabled) return;
    const last = cfg.lastRun ? new Date(cfg.lastRun).getTime() : 0;
    if (!last || (Date.now() - last) >= abIntervalMs(cfg)) await abRunNow(true);
  }
  let abTimer = null;
  function abStartTimer() {
    if (abTimer) return;
    abTimer = setInterval(() => { try { abCheckDue(); } catch (e) { /* ignore */ } }, 60000);
  }

  function renderAutoBackup(c) {
    const cfg = abLoad();
    abStartTimer();
    c.querySelector('#ab-box').innerHTML =
      '<div class="row" style="gap:10px">' +
        '<div class="field" style="align-items:center"><label style="margin:0"><input type="checkbox" id="ab-enabled"' + (cfg.enabled ? ' checked' : '') + '> Activer la sauvegarde automatique</label></div>' +
      '</div>' +
      '<div class="row" style="gap:10px">' +
        '<div class="field"><label>Période : tous les</label>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<input type="number" id="ab-value" min="1" max="720" value="' + cfg.value + '" style="width:80px">' +
            '<select id="ab-unit">' +
              '<option value="heure"' + (cfg.unit === 'heure' ? ' selected' : '') + '>heure(s)</option>' +
              '<option value="jour"' + (cfg.unit === 'jour' ? ' selected' : '') + '>jour(s)</option>' +
              '<option value="semaine"' + (cfg.unit === 'semaine' ? ' selected' : '') + '>semaine(s)</option>' +
              '<option value="mois"' + (cfg.unit === 'mois' ? ' selected' : '') + '>mois</option>' +
              '<option value="annee"' + (cfg.unit === 'annee' ? ' selected' : '') + '>année(s)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="field"><label>Emplacement de stockage</label>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<input id="ab-folder" readonly value="' + UI.esc(cfg.folder || '') + '" placeholder="Aucun dossier défini" style="flex:1;min-width:180px">' +
            '<button class="btn btn-outline" id="ab-browse">Parcourir…</button>' +
            (cfg.folder ? '<button class="btn btn-sm btn-ghost" id="ab-clear">✕</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="row" style="gap:10px">' +
        '<button class="btn btn-ok" id="ab-now">💾 Sauvegarder maintenant</button>' +
        '<span class="hint" id="ab-state"></span>' +
      '</div>';

    const bridge = window.GSBridge;
    const hasDir = bridge && bridge.available && bridge.currentLocation && bridge.currentLocation();
    c.querySelector('#ab-folder').value = hasDir ? bridge.currentLocation() : (cfg.folder || '');
    if (!bridge || !bridge.available) {
      c.querySelector('#ab-browse').disabled = true;
      c.querySelector('#ab-folder').placeholder = 'Non supporté ici (basculera en téléchargement)';
    }
    const stateEl = c.querySelector('#ab-state');
    if (cfg.enabled) {
      stateEl.textContent = (cfg.lastRun ? 'Dernière : ' + new Date(cfg.lastRun).toLocaleString('fr-FR') : 'Jamais encore exécutée.');
    }

    c.querySelector('#ab-enabled').onchange = () => {
      const on = c.querySelector('#ab-enabled').checked;
      cfg.enabled = on;
      if (on && !cfg.lastRun) cfg.lastRun = new Date().toISOString();
      abSave(cfg);
      UI.toast(on ? 'Sauvegarde automatique activée.' : 'Sauvegarde automatique désactivée.', 'ok');
    };
    c.querySelector('#ab-value').onchange = () => {
      cfg.value = Math.max(1, Math.floor(Number(c.querySelector('#ab-value').value) || 1));
      abSave(cfg);
    };
    c.querySelector('#ab-unit').onchange = () => {
      cfg.unit = c.querySelector('#ab-unit').value;
      abSave(cfg);
    };
    const folderEl = c.querySelector('#ab-folder');
    c.querySelector('#ab-browse').onclick = async () => {
      try {
        const picked = await window.GSBridge.selectFolder();
        if (picked) {
          cfg.folder = picked;
          abSave(cfg);
          folderEl.value = picked;
          UI.toast('Emplacement défini : ' + picked, 'ok');
        }
      } catch (ex) { UI.toast('Erreur : ' + ex.message, 'err'); }
    };
    const clearBtn = c.querySelector('#ab-clear');
    if (clearBtn) clearBtn.onclick = () => {
      cfg.folder = '';
      abSave(cfg);
      folderEl.value = '';
      c.querySelector('#ab-clear').style.display = 'none';
      UI.toast('Emplacement réinitialisé.', 'ok');
    };
    c.querySelector('#ab-now').onclick = async () => {
      await abRunNow(false);
      if (cfg.enabled) stateEl.textContent = 'Dernière : ' + new Date(abLoad().lastRun).toLocaleString('fr-FR');
    };
  }

  async function exportEleves() {
    const rows = (await DB.getAll('eleves') || []).map((e) => [e.matricule, (e.nom || '') + ' ' + (e.prenom || ''), e.sexe, UI.dateFr(e.dateNaissance), e.classeId || '', e.anneeId || '']);
    Store.downloadCSV(['Matricule', 'Nom complet', 'Sexe', 'Naissance', 'Classe', 'Année'], rows, 'eleves.csv');
  }
  async function exportEnseignants() {
    const rows = (await DB.getAll('enseignants') || []).map((e) => [e.matricule, (e.nom || '') + ' ' + (e.prenom || ''), e.sexe, e.tel || '', e.email || '']);
    Store.downloadCSV(['Matricule', 'Nom complet', 'Sexe', 'Téléphone', 'Email'], rows, 'enseignants.csv');
  }
  async function exportTypesFrais() {
    const rows = (await DB.getAll('typesFrais') || []).map((f) => [f.libelle || f.nom, f.montant, f.periodicite || '']);
    Store.downloadCSV(['Type de frais', 'Montant', 'Périodicité'], rows, 'types-frais.csv');
  }
  async function exportFrais() {
    const rows = (await DB.getAll('fraisEncaissements') || []).map((f) => [UI.dateFr(f.date), f.eleveId || f.eleve || '', f.montant, f.typeFraisId || f.type || '', f.modePaiement || '']);
    Store.downloadCSV(['Date', 'Élève', 'Montant', 'Type de frais', 'Mode de paiement'], rows, 'encaissements-frais.csv');
  }
  async function exportSalaires() {
    const rows = (await DB.getAll('salaires') || []).map((s) => [UI.dateFr(s.date || s.periode), s.enseignantId || '', s.montant || s.salaire || '']);
    Store.downloadCSV(['Période', 'Enseignant', 'Montant'], rows, 'salaires.csv');
  }
  async function exportNotes() {
    const rows = (await DB.getAll('notes') || []).map((n) => [n.eleveId || '', n.matiereId || '', n.classeId || '', n.devoir1, n.devoir2, n.composition]);
    Store.downloadCSV(['Élève', 'Matière', 'Classe', 'Devoir 1', 'Devoir 2', 'Composition'], rows, 'notes.csv');
  }

  // ================= JOURNAL =================
  async function renderJournal(c) {
    const journal = (await DB.getAll('journal') || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const rows = journal.slice(0, 200).map((j) => {
      const d = new Date(j.date);
      const dt = isNaN(d) ? j.date : d.toLocaleString('fr-FR');
      return '<tr>' +
        '<td>' + UI.esc(dt) + '</td>' +
        '<td>' + UI.esc(j.username || j.userId || '—') + '</td>' +
        '<td>' + UI.esc(j.module || '') + '</td>' +
        '<td>' + UI.esc(j.action || '') + '</td>' +
        '<td>' + UI.esc(j.details || '') + '</td></tr>';
    }).join('');
    c.innerHTML =
      '<div class="bar" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">' +
        '<span class="hint">' + journal.length + ' entrée(s) — les 200 plus récentes affichées</span>' +
        (Auth.can('users.manage') ? '<button class="btn btn-sm btn-danger" id="pj-clear">Vider le journal</button>' : '') +
      '</div>' +
      '<div class="pm-scroll">' + UI.table(['Date', 'Utilisateur', 'Module', 'Action', 'Détails'], rows || UI.empty(5)) + '</div>';
    const b = c.querySelector('#pj-clear');
    if (b) b.onclick = async () => {
      const ok = await UI.confirm('Vider le journal d\'audit de cet établissement ?', async () => {
        await DB.clear('journal');
        UI.closeModal(); UI.toast('Journal vidé.', 'ok');
        renderJournal(c);
      }, { title: 'Vider le journal' });
    };
  }

  return { show: show };
})();

App.register('parametres', {
  navLabel: 'Paramètres',
  icon: 'P',
  group: 'Système',
  perm: 'users.manage',
  title: 'Paramètres & Administration',
  render: function (root) { Parametres.show(root); }
});