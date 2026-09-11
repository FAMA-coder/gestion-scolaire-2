/* ============================================================
   core.js — Modules système : utilisateurs, école, années/trimestres,
   cycles, salles. + helpers de données partagés (Data)
   ============================================================ */
window.Data = (function () {
  // Renvoie toutes les entités courantes (liées à l'école en cours)
  async function common() {
    const [users, cycles, salles, niveaux, classes, matieres, enseignants, affectations, eleves,
      annees, trimestres, emplois, cours, notes, compositions, passages] =
      await Promise.all([
        DB.getAll('users'), DB.getAll('cycles'), DB.getAll('salles'), DB.getAll('niveaux'),
        DB.getAll('classes'), DB.getAll('matieres'), DB.getAll('enseignants'),
        DB.getAll('affectations'), DB.getAll('eleves'),
        DB.getAll('annees'), DB.getAll('trimestres'), DB.getAll('emplois'),
        DB.getAll('cours'), DB.getAll('notes'), DB.getAll('compositions'), DB.getAll('passages')
      ]);
    return { users, cycles, salles, niveaux, classes, matieres, enseignants, affectations, eleves,
      annees, trimestres, emplois, cours, notes, compositions, passages };
  }

  function classeLabel(cl) {
    if (!cl) return '–';
    return [cl.libelle, cl.mention ? ' ' + cl.mention : ''].join('').trim();
  }
  function userName(u) { return u ? ((u.nom || '') + ' ' + (u.prenom || '')).trim() : '–'; }
  function personneNom(p) { return p ? ((p.nom || '') + ' ' + (p.prenom || '')).trim() : '–'; }

  // Trimestres effectifs : si aucun trimestre n'a été créé (école non configurée),
  // on propose des trimestres par défaut pour permettre saisie des notes et bulletins.
  // Ces trimestres de repli portent des ids négatifs stables, partagés par les modules
  // notes (eval) et bulletins pour rester cohérents.
  function effectiveTrimestres(trims) {
    if (trims && trims.length) return trims;
    return [
      { id: -1, libelle: 'Trimestre 1', anneeId: null, fallback: true },
      { id: -2, libelle: 'Trimestre 2', anneeId: null, fallback: true },
      { id: -3, libelle: 'Trimestre 3', anneeId: null, fallback: true }
    ];
  }
  // Résout un trimestre (réel via son id, ou de repli) pour un affichage correct.
  function trimById(trims, id, anneeId) {
    if (trims && trims.length) {
      const found = trims.find(t => t.id === Number(id));
      if (found) return found;
    }
    const fb = effectiveTrimestres([]).find(t => t.id === Number(id));
    if (fb) return { id: fb.id, libelle: fb.libelle, anneeId: anneeId != null ? anneeId : (fb.anneeId != null ? fb.anneeId : null), fallback: true };
    return null;
  }

  return { common: common, classeLabel: classeLabel, userName: userName, personneNom: personneNom, effectiveTrimestres: effectiveTrimestres, trimById: trimById };
})();

/* ---------------- UTILISATEURS ---------------- */
App.register('users', {
  title: 'Utilisateurs & Accès',
  navLabel: 'Utilisateurs',
  icon: 'U',
  group: 'Système',
  perm: 'users.manage',
  hidden: true,
  render: async function (root) {
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Gestion des utilisateurs</div>' +
      '<button class="btn btn-primary" id="u-add">+ Nouvel utilisateur</button></div></div>' +
      '<div class="bar"><div id="u-list" class="table-wrap"><div class="empty">Chargement…</div></div></div>';
    const listEl = root.querySelector('#u-list');
    const users = await DB.getAll('users');
    renderList();
    function renderList() {
      const me = Auth.currentUser();
      const visible = users.filter((u) => (me && Auth.isPrincipalAdmin(me)) || !Auth.isPrincipalAdmin(u));
      const rows = visible.map((u) => {
        const m = Auth.ROLES[u.role];
        return '<tr><td><strong>' + UI.esc(Data.userName(u)) + '</strong></td>' +
          '<td>' + UI.esc(u.username) + '</td>' +
          '<td><span class="badge ' + (m ? m.class : 'badge-gray') + '">' + UI.esc(Auth.roleLib(u.role)) + '</span></td>' +
          '<td>' + (u.actif === false ? '<span class="badge badge-gray">Inactif</span>' : '<span class="badge badge-ok">Actif</span>') + '</td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-edit="' + u.id + '">Modifier</button>' +
            '<button class="btn btn-sm ' + (u.actif === false ? 'btn-ok' : 'btn-ghost') + '" data-toggle="' + u.id + '">' + (u.actif === false ? 'Activer' : 'Désactiver') + '</button>' +
            (users.filter(x => x.role === 'super_admin' && x.actif !== false).length > 1 || u.role !== 'super_admin'
              ? '<button class="btn btn-sm btn-danger" data-del="' + u.id + '">Suppr.</button>' : '') +
          '</td></tr>';
      }).join('');
      listEl.innerHTML = UI.table(['Nom', 'Identifiant', 'Rôle', 'Statut', 'Actions'], rows);
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formUser(users.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
        const u = users.find(x => x.id === Number(b.dataset.toggle));
        u.actif = (u.actif === false);
        await DB.put('users', u); UI.toast('Statut mis à jour.', 'ok'); renderList();
      });
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const u = users.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer l\'utilisateur « ' + Data.userName(u) + ' » ?', async () => {
          await DB.del('users', u.id); UI.toast('Utilisateur supprimé.', 'ok');
          const i = users.findIndex(x => x.id === u.id); if (i >= 0) users.splice(i, 1); renderList();
        }, { title: 'Supprimer un utilisateur' });
      });
    }
    async function formUser(u) {
      u = u || {};
      const isNew = !u.id;
      const roleOpts = (await Auth.editableRoles()).map((r) => {
        const m = Auth.ROLES[r];
        return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + UI.esc(m ? m.libelle : r) + '</option>';
      }).join('');
      UI.prompt(isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur', `
        <div class="row">
          <div class="field"><label>Nom *</label><input id="u-nom" value="${UI.esc(u.nom || '')}" required></div>
          <div class="field"><label>Prénom</label><input id="u-prenom" value="${UI.esc(u.prenom || '')}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Identifiant *</label><input id="u-username" value="${UI.esc(u.username || '')}" required${isNew ? '' : ''} autocomplete="off" autocapitalize="none" autocorrect="off"></div>
          <div class="field"><label>Rôle *</label><select id="u-role">${roleOpts}</select></div>
        </div>
        <div class="field"><label>${isNew ? 'Mot de passe *' : 'Nouveau mot de passe (laisser vide pour conserver)'}</label><input id="u-pwd" type="password"${isNew ? ' required' : ''} autocomplete="new-password"></div>
        ${isNew ? '<small class="hint">Par défaut, un compte « élève/enseignant » peut être relié plus tard à une fiche.</small>' : ''}
      `, async (body) => {
        const nom = body.querySelector('#u-nom').value.trim();
        const prenom = body.querySelector('#u-prenom').value.trim();
        const username = body.querySelector('#u-username').value.trim();
        const role = body.querySelector('#u-role').value;
        const pwd = body.querySelector('#u-pwd').value;
        if (!nom || !username || !role) { UI.toast('Renseignez nom, identifiant et rôle.', 'err'); return false; }
        const dup = users.find(x => x.username.toLowerCase() === username.toLowerCase() && x.id !== u.id);
        if (dup) { UI.toast('Cet identifiant est déjà utilisé.', 'err'); return false; }
        const data = { nom, prenom, username, role, actif: u.actif === undefined ? true : u.actif };
        if (isNew) {
          if (!pwd) { UI.toast('Mot de passe requis.', 'err'); return false; }
          data.salt = AUTH_ENV.salt;
          data.passwordHash = AUTH_ENV.sha256(pwd + AUTH_ENV.salt);
          data.dateCreation = UI.nowIso();
        } else {
          data.id = u.id;
          data.salt = u.salt || AUTH_ENV.salt;
          data.passwordHash = u.passwordHash;
          if (pwd) data.passwordHash = AUTH_ENV.sha256(pwd + data.salt);
          data.dateCreation = u.dateCreation;
        }
        if (isNew) { await DB.add('users', data); users.push(data); }
        else { await DB.put('users', data); Object.assign(u, data); }
        UI.closeModal(); UI.toast(isNew ? 'Utilisateur créé.' : 'Utilisateur modifié.', 'ok'); renderList();
        return true;
      }, { size: 'modal' });
    }
    root.querySelector('#u-add').onclick = () => formUser(null);
  }
});

/* ---------------- ÉCOLE (paramètres + logo) ---------------- */
App.register('ecole', {
  title: 'Informations de l\'école',
  navLabel: 'École',
  icon: 'E',
  group: 'Système',
  perm: 'ecole.manage',
  hidden: true,
  render: async function (root) {
    let eco = await DB.get('ecole', 1) || { id: 1 };
    const u = Auth.currentUser();
    const isSuper = !!(u && u.role === 'super_admin');
    if (!isSuper) {
      root.innerHTML = `
      <div class="bar"><div class="card-title">Informations de l'établissement</div>
        <p class="card-sub">Logo et identité visible sur la page de connexion et les bulletins.</p></div>
      <div class="bar">
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px">
          <div class="login-logo" style="width:90px;height:90px;margin:0">${eco.logo ? '<img src="' + eco.logo + '">' : 'GS'}</div>
          <div><b>${UI.esc(eco.nom || '—')}</b>${eco.slogan ? '<div style="opacity:.7">' + UI.esc(eco.slogan) + '</div>' : ''}</div>
        </div>` +
        (eco.adresse ? '<p><b>Adresse :</b> ' + UI.esc(eco.adresse) + '</p>' : '') +
        (eco.tel ? '<p><b>Téléphone :</b> ' + UI.esc(eco.tel) + '</p>' : '') +
        (eco.email ? '<p><b>Email :</b> ' + UI.esc(eco.email) + '</p>' : '') +
        (eco.type ? '<p><b>Type d\u2019établissement :</b> ' + UI.esc(({ fondamental: 'Fondamental (signature : Directeur)', lycee: 'Secondaire / Lycée (signature : Proviseur)', superieur: 'Supérieur / Université (signature : Doyen / Secrétaire Général)' }[eco.type] || eco.type)) + '</p>' : '') +
        (eco.directeur ? '<p><b>Directeur(trice) / Fondateur :</b> ' + UI.esc(eco.directeur) + '</p>' : '') +
        '</div>';
      return;
    }
    root.innerHTML = `
      <div class="bar"><div class="card-title">Informations de l'établissement</div>
        <p class="card-sub">Logo et identité visible sur la page de connexion et les bulletins.</p></div>
      <div class="bar"><div class="card-title">Données d'exemple</div>
        <p class="card-sub">Charge un jeu de données de démonstration (cycles, niveaux, salles, classes, élèves, enseignants, matières, affectations, emploi du temps, notes, bulletins, frais, salaires) pour explorer l'application.</p>
        <p class="card-sub" style="color:#b91c1c"><b>Attention :</b> cette action efface toutes les données actuelles de l'établissement avant d'insérer les données d'exemple.</p>
        <button class="btn btn-outline" id="demo-load" style="width:max-content">Charger les données d'exemple</button>
      </div>
      <div class="bar"><form id="eco-form">
        <div class="row">
          <div class="field"><label>Nom de l'école *</label><input id="e-nom" value="${UI.esc(eco.nom || '')}" required></div>
          <div class="field"><label>Slogan</label><input id="e-slogan" value="${UI.esc(eco.slogan || '')}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Adresse</label><input id="e-adresse" value="${UI.esc(eco.adresse || '')}"></div>
          <div class="field"><label>Téléphone</label><input id="e-tel" value="${UI.esc(eco.tel || '')}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Email</label><input id="e-email" value="${UI.esc(eco.email || '')}"></div>
          <div class="field"><label>Type d'établissement</label><select id="e-type">${UI.options([
            { id: '', libelle: '—' },
            { id: 'fondamental', libelle: 'Fondamental (signature : Directeur)' },
            { id: 'lycee', libelle: 'Secondaire / Lycée (signature : Proviseur)' },
            { id: 'superieur', libelle: 'Supérieur / Université (signature : Doyen / Secrétaire Général)' }
            ], eco.type || '', null)}</select></div>
        </div>
        <div class="row">
          <div class="field"><label>Directeur(trice) / Fondateur</label><input id="e-directeur" value="${UI.esc(eco.directeur || '')}"></div>
        </div>
        <div class="field">
          <label>Logo</label>
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
            <div class="login-logo" style="width:90px;height:90px;margin:0" id="logo-preview">${eco.logo ? '<img src="' + eco.logo + '">' : 'GS'}</div>
            <div style="flex:1;min-width:180px">
              <input type="file" id="e-logo" accept="image/*">
              <small class="hint">PNG/JPG recommandé. Image stockée localement.</small>
              ${eco.logo ? '<div><button type="button" class="btn btn-sm btn-ghost" id="e-logo-remove">Retirer le logo</button></div>' : ''}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </form></div>`;
    const preview = root.querySelector('#logo-preview');
    root.querySelector('#e-logo').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const url = await UI.fileToDataUrl(f);
      preview.innerHTML = '<img src="' + url + '">';
      preview._logo = url;
    });
    const rmBtn = root.querySelector('#e-logo-remove');
    if (rmBtn) rmBtn.onclick = () => { preview.innerHTML = 'GS'; delete preview._logo; eco.logo = null; };
    const demoBtn = root.querySelector('#demo-load');
    if (demoBtn) {
      if (!window.SampleData) { demoBtn.style.display = 'none'; }
      else demoBtn.onclick = () => {
        UI.confirm('Charger les données d\'exemple ? Cette action EFFACERA toutes les données actuelles de l\'établissement avant d\'insérer le jeu de démonstration.', async () => {
          demoBtn.disabled = true;
          demoBtn.textContent = 'Chargement…';
          try {
            await SampleData.resetAndPopulate();
            UI.toast('Données d\'exemple chargées avec succès.', 'ok');
            App.refreshBranding();
            App.go('ecole');
          } catch (err) {
            UI.toast('Erreur lors du chargement : ' + (err && err.message || err), 'err');
            demoBtn.disabled = false;
            demoBtn.textContent = 'Charger les données d\'exemple';
          }
        }, { title: 'Charger les données d\'exemple' });
      };
    }
    root.querySelector('#eco-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const g = (id) => root.querySelector(id).value.trim();
      eco.nom = g('#e-nom');
      eco.slogan = g('#e-slogan');
      eco.adresse = g('#e-adresse');
      eco.tel = g('#e-tel');
      eco.email = g('#e-email');
      eco.directeur = g('#e-directeur');
      eco.type = g('#e-type');
      if (preview._logo) eco.logo = preview._logo;
      await DB.put('ecole', eco);
      UI.toast('École mise à jour.', 'ok');
      App.refreshBranding();
    });
  }
});

/* ---------------- ANNÉES SCOLAIRES & TRIMESTRES ---------------- */
App.register('annees', {
  title: 'Années scolaires',
  navLabel: 'Années scolaires',
  icon: 'A',
  group: 'Système',
  perm: 'annees.manage',
  render: async function (root) {
    let eco = await DB.get('ecole', 1) || { id: 1 };
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Années scolaires</div>' +
      '<button class="btn btn-primary" id="a-add">+ Nouvelle année</button></div></div>' +
      '<div class="bar"><div id="a-list"></div></div>';
    const listEl = root.querySelector('#a-list');
    renderYears();
    async function renderYears() {
      const annees = await DB.getAll('annees');
      const allTrims = await DB.getAll('trimestres');
      const rows = (await Promise.all(annees.map(async (a) => {
        const trims = allTrims.filter((t) => t.anneeId === a.id);
        return '<tr><td><strong>' + UI.esc(a.libelle || '') + '</strong></td>' +
          '<td>' + (a.dateDebut ? UI.dateFr(a.dateDebut) : '–') + ' → ' + (a.dateFin ? UI.dateFr(a.dateFin) : '–') + '</td>' +
          '<td>' + (a.id === eco.anneeEnCoursId ? '<span class="badge badge-ok">En cours</span>' : '') + '</td>' +
          '<td>' + trims.map((t) => '<span class="badge badge-info">' + UI.esc(t.libelle || '') + '</span>').join(' ') + '</td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-toggle="' + a.id + '">' + (a.id === eco.anneeEnCoursId ? 'Retirer' : 'Définir en cours') + '</button>' +
            '<button class="btn btn-sm btn-outline" data-trim="' + a.id + '" data-lib="' + UI.esc(a.libelle) + '">Trimestres</button>' +
            '<button class="btn btn-sm btn-ghost" data-edit="' + a.id + '">Modifier</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + a.id + '">Suppr.</button>' +
          '</td></tr>';
      }))).join('');
      listEl.innerHTML = UI.table(['Année', 'Période', 'Statut', 'Trimestres', 'Actions'], rows || UI.empty(5));
      listEl.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
        const id = Number(b.dataset.toggle);
        eco.anneeEnCoursId = (eco.anneeEnCoursId === id ? null : id);
        await DB.put('ecole', eco); UI.toast('Année en cours mise à jour.', 'ok'); renderYears(); App.refreshBranding();
      });
      listEl.querySelectorAll('[data-trim]').forEach((b) => b.onclick = () => trimModal(Number(b.dataset.trim), b.dataset.lib));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formYear(Number(b.dataset.edit)));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const id = Number(b.dataset.del);
        UI.confirm('Supprimer cette année scolaire ?', async () => {
          await DB.del('annees', id);
          const t = (await DB.getAll('trimestres')).filter(x => x.anneeId === id);
          for (const tr of t) await DB.del('trimestres', tr.id);
          renderYears();
        }, { title: 'Supprimer une année' });
      });
    }
    function formYear(id) {
      UI.prompt('Nouvelle année scolaire', `
        <div class="field"><label>Libellé *</label><input id="y-lib" placeholder="Ex : 2024-2025" required></div>
        <div class="row">
          <div class="field"><label>Date de début</label><input id="y-db" type="date"></div>
          <div class="field"><label>Date de fin</label><input id="y-df" type="date"></div>
        </div>
      `, async (body) => {
        const lib = body.querySelector('#y-lib').value.trim();
        if (!lib) { UI.toast('Libellé requis.', 'err'); return false; }
        const a = { libelle: lib, dateDebut: body.querySelector('#y-db').value, dateFin: body.querySelector('#y-df').value, dateCreation: UI.nowIso() };
        await DB.add('annees', a);
        UI.closeModal(); UI.toast('Année créée.', 'ok'); renderYears();
        return true;
      });
    }
    function trimModal(anneeId, anneeLib) {
      UI.prompt('Trimestres — ' + anneeLib, `<div id="tr-list"></div>
        <div class="row">
          <div class="field"><label>Nouveau trimestre</label><input id="tr-lib" placeholder="Ex : Trimestre 1"></div>
          <div class="field" style="display:flex;align-items:flex-end"><button type="button" class="btn btn-outline" id="tr-add">+ Ajouter</button></div>
        </div>
      `, async (body, close) => {
        const box = body.querySelector('#tr-list');
        const renderT = async () => {
          const trims = (await DB.getAll('trimestres')).filter((t) => t.anneeId === anneeId);
          box.innerHTML = trims.length ? trims.map((t) => '<div class="notice" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span>' + UI.esc(t.libelle) + '</span><button type="button" class="btn btn-sm btn-danger" data-trdel="' + t.id + '">×</button></div>').join('')
            : '<div class="empty">Aucun trimestre</div>';
          box.querySelectorAll('[data-trdel]').forEach((b) => b.onclick = async () => { await DB.del('trimestres', Number(b.dataset.trdel)); renderT(); });
        };
        await renderT();
        body.querySelector('#tr-add').onclick = async () => {
          const lib = body.querySelector('#tr-lib').value.trim();
          if (!lib) { UI.toast('Libellé requis.', 'err'); return; }
          await DB.add('trimestres', { libelle: lib, anneeId: anneeId, dateCreation: UI.nowIso() });
          body.querySelector('#tr-lib').value = '';
          renderT();
        };
        close();
        return true;
      }, { size: 'modal', okLabel: 'Fermer' });
    }
    root.querySelector('#a-add').onclick = () => formYear();
  }
});

/* ---------------- CYCLES ---------------- */
App.register('cycles', {
  title: 'Cycles',
  navLabel: 'Cycles',
  icon: 'C',
  group: 'Structure',
  perm: 'cycles.manage',
  render: async function (root) {
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Cycles d\'enseignement</div>' +
      '<button class="btn btn-primary" id="c-add">+ Nouveau cycle</button></div></div>' +
      '<div class="bar"><div id="c-list"></div></div>';
    const listEl = root.querySelector('#c-list');
    renderList();
    async function renderList() {
      const cycles = await DB.getAll('cycles');
      const niveaux = await DB.getAll('niveaux');
      const rows = cycles.map((c) => {
        const cnt = niveaux.filter((n) => n.cycleId === c.id).length;
        return '<tr><td><strong>' + UI.esc(c.libelle) + '</strong></td><td>' + UI.esc(c.description || '–') + '</td>' +
          '<td>' + cnt + ' niveau(x)</td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-edit="' + c.id + '">Modifier</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + c.id + '">Suppr.</button>' +
          '</td></tr>';
      }).join('');
      listEl.innerHTML = UI.table(['Cycle', 'Description', 'Niveaux', 'Actions'], rows || UI.empty(4));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formCycle(cycles.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const cy = cycles.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer le cycle « ' + cy.libelle + ' » ?', async () => {
          await DB.del('cycles', cy.id); renderList();
        }, { title: 'Supprimer un cycle' });
      });
    }
    function formCycle(c) {
      c = c || {};
      UI.prompt(c.id ? 'Modifier le cycle' : 'Nouveau cycle', `
        <div class="field"><label>Libellé *</label><input id="cy-lib" value="${UI.esc(c.libelle || '')}" required placeholder="Ex : Fondamental 1"></div>
        <div class="field"><label>Description</label><textarea id="cy-desc" rows="2">${UI.esc(c.description || '')}</textarea></div>
        <div class="field"><label><input type="checkbox" id="cy-pp" ${c.enseignantPrincipal ? 'checked' : ''}> Autoriser un enseignant principal par classe (Préscolaire / Fondamental 1)</label>
          <small class="hint">À partir du Fondamental 1 et au-delà, on applique la règle : pas d'enseignant principal pour une classe.</small></div>
      `, async (body) => {
        const lib = body.querySelector('#cy-lib').value.trim();
        if (!lib) { UI.toast('Libellé requis.', 'err'); return false; }
        const data = { libelle: lib, description: body.querySelector('#cy-desc').value.trim(), enseignantPrincipal: body.querySelector('#cy-pp').checked };
        if (c.id) { data.id = c.id; await DB.put('cycles', data); }
        else await DB.add('cycles', data);
        UI.closeModal(); UI.toast('Cycle enregistré.', 'ok'); renderList();
        return true;
      });
    }
    root.querySelector('#c-add').onclick = () => formCycle();
  }
});

/* ---------------- SALLES ---------------- */
App.register('salles', {
  title: 'Salles',
  navLabel: 'Salles',
  icon: 'S',
  group: 'Structure',
  perm: 'salles.manage',
  render: async function (root) {
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Salles de classe</div>' +
      '<button class="btn btn-primary" id="sa-add">+ Nouvelle salle</button></div></div>' +
      '<div class="bar"><div id="sa-list"></div></div>';
    const listEl = root.querySelector('#sa-list');
    renderList();
    async function renderList() {
      const salles = await DB.getAll('salles');
      const rows = salles.map((s) => '<tr><td><strong>' + UI.esc(s.libelle) + '</strong></td>' +
        '<td>' + UI.esc(s.localisation || '–') + '</td>' +
        '<td>' + (s.capacite ? s.capacite + ' places' : '–') + '</td>' +
        '<td>' + (s.type || '–') + '</td>' +
        '<td class="actions-cell">' +
          '<button class="btn btn-sm btn-outline" data-edit="' + s.id + '">Modifier</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + s.id + '">Suppr.</button>' +
        '</td></tr>').join('');
      listEl.innerHTML = UI.table(['Salle', 'Localisation', 'Capacité', 'Type', 'Actions'], rows || UI.empty(5));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formSalle(salles.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const s = salles.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer la salle « ' + s.libelle + ' » ?', async () => { await DB.del('salles', s.id); renderList(); }, { title: 'Supprimer une salle' });
      });
    }
    function formSalle(s) {
      s = s || {};
      UI.prompt(s.id ? 'Modifier la salle' : 'Nouvelle salle', `
        <div class="row">
          <div class="field"><label>Libellé *</label><input id="sa-lib" value="${UI.esc(s.libelle || '')}" required placeholder="Ex : Salle A1"></div>
          <div class="field"><label>Type</label><select id="sa-type">${UI.options([{value:'',label:'—'},{value:'Classe',label:'Classe'},{value:'Laboratoire',label:'Laboratoire'},{value:'Informatique',label:'Informatique'},{value:'Salle polyvalente',label:'Salle polyvalente'}], s.type || '', null)}</select></div>
        </div>
        <div class="row">
          <div class="field"><label>Localisation</label><input id="sa-loc" value="${UI.esc(s.localisation || '')}" placeholder="Ex : Bâtiment B, 1er étage"></div>
          <div class="field"><label>Capacité</label><input id="sa-cap" type="number" min="0" value="${s.capacite || ''}"></div>
        </div>
      `, async (body) => {
        const lib = body.querySelector('#sa-lib').value.trim();
        if (!lib) { UI.toast('Libellé requis.', 'err'); return false; }
        const data = {
          libelle: lib,
          type: body.querySelector('#sa-type').value,
          localisation: body.querySelector('#sa-loc').value.trim(),
          capacite: Number(body.querySelector('#sa-cap').value) || null
        };
        if (s.id) { data.id = s.id; await DB.put('salles', data); }
        else await DB.add('salles', data);
        UI.closeModal(); UI.toast('Salle enregistrée.', 'ok'); renderList();
        return true;
      });
    }
    root.querySelector('#sa-add').onclick = () => formSalle();
  }
});
