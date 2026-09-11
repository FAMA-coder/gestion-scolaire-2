/* ============================================================
   scolarite.js — Niveaux, Classes, Élèves / Étudiants
   ============================================================ */

/* ---------------- NIVEAUX ---------------- */
App.register('niveaux', {
  title: 'Niveaux',
  navLabel: 'Niveaux',
  icon: 'N',
  group: 'Structure',
  perm: 'niveaux.manage',
  render: async function (root) {
    let cycles = await DB.getAll('cycles');
    let filter = null;
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Niveaux par cycle</div>' +
      '<div class="toolbar"><select id="nv-filter" style="width:auto"><option value="">Tous les cycles</option></select>' +
      '<button class="btn btn-primary" id="nv-add">+ Nouveau niveau</button></div></div>' +
      '<div class="table-wrap" id="nv-list"></div></div>';
    const filterEl = root.querySelector('#nv-filter');
    const listEl = root.querySelector('#nv-list');
    filterEl.innerHTML = UI.options(cycles.map(c => ({ value: c.id, label: c.libelle })), '', 'Tous les cycles');
    filterEl.onchange = () => { filter = filterEl.value ? Number(filterEl.value) : null; renderList(); };
    renderList();
    async function renderList() {
      let niveaux = await DB.getAll('niveaux');
      const rows = niveaux.map((n) => {
        const cy = cycles.find(c => c.id === n.cycleId);
        if (filter && n.cycleId !== filter) return null;
        return '<tr><td><strong>' + UI.esc(n.libelle) + '</strong></td>' +
          '<td><span class="badge badge-primary">' + UI.esc(cy ? cy.libelle : '–') + '</span></td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-edit="' + n.id + '">Modifier</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + n.id + '">Suppr.</button>' +
          '</td></tr>';
      }).filter(Boolean).join('');
      listEl.innerHTML = UI.table(['Niveau', 'Cycle', 'Actions'], rows || UI.empty(3));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formNiveau(niveaux.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const n = niveaux.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer le niveau « ' + n.libelle + ' » ?', async () => { await DB.del('niveaux', n.id); renderList(); }, { title: 'Supprimer un niveau' });
      });
    }
    function formNiveau(n) {
      n = n || {};
      UI.prompt(n.id ? 'Modifier le niveau' : 'Nouveau niveau', `
        <div class="row">
          <div class="field"><label>Cycle *</label><select id="nv-cycle">${UI.options(cycles.map(c => ({ value: c.id, label: c.libelle })), n.cycleId, 'Choisir…')}</select></div>
          <div class="field"><label>Libellé *</label><input id="nv-lib" value="${UI.esc(n.libelle || '')}" required placeholder="Ex : Niveau 1"></div>
        </div>
      `, async (body) => {
        const lib = body.querySelector('#nv-lib').value.trim();
        const cycleId = Number(body.querySelector('#nv-cycle').value);
        if (!lib || !cycleId) { UI.toast('Renseignez cycle et libellé.', 'err'); return false; }
        const data = { libelle: lib, cycleId };
        if (n.id) { data.id = n.id; await DB.put('niveaux', data); }
        else await DB.add('niveaux', data);
        UI.closeModal(); UI.toast('Niveau enregistré.', 'ok'); renderList();
        return true;
      });
    }
    root.querySelector('#nv-add').onclick = () => {
      if (!cycles.length) { UI.toast('Créez d\'abord un cycle.', 'err'); return; }
      formNiveau();
    };
  }
});

/* ---------------- CLASSES ---------------- */
App.register('classes', {
  title: 'Classes',
  navLabel: 'Classes',
  icon: 'K',
  group: 'Scolarité',
  perm: 'classes.manage',
  render: async function (root) {
    let filter = null;
    root.innerHTML = `
      <div class="bar"><div class="bar-head"><div class="card-title">Classes</div>
        <div class="toolbar">
          <select id="cl-filter" style="width:auto"><option value="">Toutes les classes</option></select>
          <button class="btn btn-primary" id="cl-add">+ Nouvelle classe</button>
        </div></div>
      <div class="table-wrap" id="cl-list"></div></div>`;
    const filterEl = root.querySelector('#cl-filter');
    const listEl = root.querySelector('#cl-list');
    loadFilter();
    async function loadFilter() {
      const cycles = await DB.getAll('cycles');
      filterEl.innerHTML = UI.options(cycles.map(c => ({ value: c.id, label: c.libelle })), '', 'Tous les cycles');
      filterEl.onchange = () => { filter = filterEl.value ? Number(filterEl.value) : null; renderList(); };
    }
    renderList();
    async function renderList() {
      const { classes, niveaux, cycles, enseignants, eleves } = await Data.common();
      const rows = classes
        .filter((cl) => {
          if (!filter) return true;
          const nv = niveaux.find(n => n.id === cl.niveauId);
          return nv && nv.cycleId === filter;
        })
        .map((cl) => {
          const nv = niveaux.find(n => n.id === cl.niveauId);
          const cy = nv ? cycles.find(c => c.id === nv.cycleId) : null;
          const nb = eleves.filter(e => e.classeId === cl.id).length;
          const pp = cl.profPrincipalId ? enseignants.find(e => e.id === cl.profPrincipalId) : null;
          return '<tr><td><strong>' + UI.esc(Data.classeLabel(cl)) + '</strong></td>' +
            '<td><span class="badge badge-primary">' + UI.esc(cy ? cy.libelle : '–') + '</span></td>' +
            '<td><span class="badge badge-info">' + UI.esc(nv ? nv.libelle : '–') + '</span></td>' +
            '<td>' + nb + '</td>' +
            '<td>' + (pp ? UI.esc(Data.personneNom(pp)) : '<span class="badge badge-gray">Aucun</span>') + '</td>' +
            '<td class="actions-cell">' +
              '<button class="btn btn-sm btn-outline" data-edit="' + cl.id + '">Modifier</button>' +
              '<button class="btn btn-sm btn-danger" data-del="' + cl.id + '">Suppr.</button>' +
            '</td></tr>';
        }).join('');
      listEl.innerHTML = UI.table(['Classe', 'Cycle', 'Niveau', 'Élèves', 'Enseignant principal', 'Actions'], rows || UI.empty(6));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formClasse(classes.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const cl = classes.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer la classe « ' + Data.classeLabel(cl) + ' » ?', async () => { await DB.del('classes', cl.id); renderList(); }, { title: 'Supprimer une classe' });
      });
    }
    async function formClasse(cl) {
      const cycles = await DB.getAll('cycles');
      const niveaux = await DB.getAll('niveaux');
      const enseignants = await DB.getAll('enseignants');
      cl = cl || {};
      const clCycle = cl.niveauId ? (niveaux.find(n => n.id === cl.niveauId) || {}).cycleId : '';
      const allowed = (cy) => cy && cy.enseignantPrincipal;
      UI.prompt(cl.id ? 'Modifier la classe' : 'Nouvelle classe', `
        <div class="row">
          <div class="field"><label>Cycle *</label><select id="cl-cycle">${UI.options(cycles.map(c => ({ id: c.id, libelle: c.libelle })), clCycle, 'Choisir…')}</select></div>
          <div class="field"><label>Niveau *</label><select id="cl-niveau"><option value="">Choisir…</option></select></div>
        </div>
        <div class="row">
          <div class="field"><label>Libellé de la classe *</label><input id="cl-lib" value="${UI.esc(cl.libelle || '')}" required placeholder="Ex : 6ème A"></div>
          <div class="field"><label>Mention / Série</label><input id="cl-mention" value="${UI.esc(cl.mention || '')}" placeholder="Ex : Scientifique"></div>
        </div>
        <div class="field" id="cl-pp-wrap" style="display:none"><label>Enseignant principal</label><select id="cl-pp"><option value="">Aucun</option></select></div>
      `, async (body) => {
        const lib = body.querySelector('#cl-lib').value.trim();
        const niveauId = Number(body.querySelector('#cl-niveau').value);
        if (!lib || !niveauId) { UI.toast('Renseignez libellé et niveau.', 'err'); return false; }
        const nv = niveaux.find(n => n.id === niveauId);
        const cy = nv ? cycles.find(c => c.id === nv.cycleId) : null;
        const obj = {
          libelle: lib,
          mention: body.querySelector('#cl-mention').value.trim(),
          niveauId,
          profPrincipalId: (cy && cy.enseignantPrincipal) ? (Number(body.querySelector('#cl-pp').value) || null) : null,
          dateCreation: cl.dateCreation || UI.nowIso()
        };
        if (cl.id) { obj.id = cl.id; await DB.put('classes', obj); }
        else await DB.add('classes', obj);
        UI.closeModal(); UI.toast('Classe enregistrée.', 'ok'); renderList();
        return true;
      });
      // Cascade cycle → niveau
      const cySel = document.querySelector('#cl-cycle');
      const nvSel = document.querySelector('#cl-niveau');
      if (cySel && nvSel) {
        function loadNiveaux() {
          const cyId = Number(cySel.value);
          const nvList = niveaux.filter(n => n.cycleId === cyId);
          nvSel.innerHTML = UI.options(nvList.map(n => ({ id: n.id, libelle: n.libelle })), cl.niveauId, 'Choisir…');
          togglePP();
        }
        function togglePP() {
          const cyId = Number(cySel.value);
          const cy = cycles.find(c => c.id === cyId);
          const wrap = document.querySelector('#cl-pp-wrap');
          const ppSel = document.querySelector('#cl-pp');
          if (wrap && ppSel) {
            if (cy && cy.enseignantPrincipal) {
              wrap.style.display = '';
              ppSel.innerHTML = UI.options(enseignants.map(e => ({ id: e.id, libelle: Data.personneNom(e) })), cl.profPrincipalId, 'Aucun');
            } else {
              wrap.style.display = 'none';
            }
          }
        }
        cySel.onchange = loadNiveaux;
        loadNiveaux();
      }
    }
    root.querySelector('#cl-add').onclick = formClasse;
  }
});

/* ---------------- ÉLÈVES / ÉTUDIANTS ---------------- */
App.register('eleves', {
  title: 'Élèves / Étudiants',
  navLabel: 'Élèves',
  icon: 'E',
  group: 'Scolarité',
  perm: 'eleves.manage',
  render: async function (root) {
    let filter = null;
    root.innerHTML = `
      <div class="bar"><div class="bar-head"><div class="card-title">Élèves & étudiants</div>
        <div class="toolbar">
          <input type="text" id="el-search" placeholder="Rechercher (nom, matricule, DN)…" style="width:220px">
          <select id="el-filter" style="width:auto"><option value="">Classe</option></select>
          <button class="btn btn-outline" id="el-export">Exporter</button>
          <button class="btn btn-outline" id="el-import">Importer</button>
          <button class="btn btn-primary" id="el-add">+ Inscrire</button>
        </div></div>
      <div class="table-wrap" id="el-list"></div></div>`;
    const searchEl = root.querySelector('#el-search');
    const filterEl = root.querySelector('#el-filter');
    const listEl = root.querySelector('#el-list');
    let classes = await DB.getAll('classes');
    const school = await DB.get('ecole', 1);
    filterEl.innerHTML = UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), '', 'Toutes les classes');
    searchEl.oninput = renderList;
    filterEl.onchange = renderList;
    renderList();
    async function renderList() {
      const { eleves, classes } = await Data.common();
      const q = searchEl.value.trim().toLowerCase();
      const rows = eleves
        .filter((e) => {
          if (filterEl.value) { const clId = Number(filterEl.value); if (e.classeId !== clId) return false; }
          if (!q) return true;
          const hay = [e.nom, e.prenom, e.matricule, e.dateNaissance || ''].join(' ').toLowerCase();
          return hay.indexOf(q) >= 0;
        })
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
        .map((e) => {
          const cl = classes.find(c => c.id === e.classeId);
          const tLabel = e.typeEleve === 'prive' ? 'Privé' : e.typeEleve === 'cas_social' ? 'Cas social' : 'Étatique';
          const tClass = e.typeEleve === 'prive' ? 'badge-info' : e.typeEleve === 'cas_social' ? 'badge-warn' : 'badge-primary';
          const ph = e.photo
            ? '<img src="' + UI.esc(e.photo) + '" class="th-photo">'
            : '<span class="th-photo th-photo-init">' + UI.avatar(e.nom, e.prenom) + '</span>';
          return '<tr><td>' + ph + '</td><td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
            '<td>' + UI.esc(e.matricule || '–') + '</td>' +
            '<td>' + (e.sexe === 'M' ? 'M' : e.sexe === 'F' ? 'F' : '–') + '</td>' +
            '<td>' + (e.dateNaissance ? UI.dateFr(e.dateNaissance) : '–') + '</td>' +
            '<td><span class="badge badge-info">' + UI.esc(cl ? Data.classeLabel(cl) : 'Non affecté') + '</span></td>' +
            '<td><span class="badge ' + tClass + '">' + tLabel + '</span>' + (e.dispenseFrais ? ' <span class="badge badge-gray">Dispensé frais</span>' : '') + '</td>' +
            '<td>' + (e.actif === false ? '<span class="badge badge-gray">Inactif</span>' : '<span class="badge badge-ok">Actif</span>') + '</td>' +
            '<td class="actions-cell">' +
              '<button class="btn btn-sm btn-outline" data-edit="' + e.id + '">Modifier</button>' +
              '<button class="btn btn-sm btn-danger" data-del="' + e.id + '">Suppr.</button>' +
            '</td></tr>';
        }).join('');
      listEl.innerHTML = UI.table(['Photo', 'Nom', 'Matricule', 'Sexe', 'Naissance', 'Classe', 'Type', 'Statut', 'Actions'], rows || UI.empty(9));
      if (classes) {
        listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formEleve(eleves.find(x => x.id === Number(b.dataset.edit))));
        listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
          const e = eleves.find(x => x.id === Number(b.dataset.del));
          UI.confirm('Supprimer l\'élève « ' + Data.personneNom(e) + ' » ?', async () => { await DB.del('eleves', e.id); renderList(); }, { title: 'Supprimer un élève' });
        });
      }
    }
    async function formEleve(e) {
      const classes = await DB.getAll('classes');
      const users = await DB.getAll('users');
      const allEleves = await DB.getAll('eleves');
      const typesFrais = await DB.getAll('typesFrais');
      e = e || {};
      const eleveUsers = users.filter(u => u.role === 'eleve' && !allEleves.some(x => x.userId === u.id && x.id !== e.id));
      const m = UI.prompt(e.id ? 'Modifier l\'élève' : 'Inscrire un élève / étudiant', `
        <div class="row">
          <div class="field"><label>Nom *</label><input id="e-nom" value="${UI.esc(e.nom || '')}" required></div>
          <div class="field"><label>Prénom</label><input id="e-prenom" value="${UI.esc(e.prenom || '')}"></div>
        </div>
        <div class="row-3">
          <div class="field"><label>Sexe</label><select id="e-sexe">${UI.options([{id:'M',libelle:'Masculin'},{id:'F',libelle:'Féminin'}], e.sexe || '', '—')}</select></div>
          <div class="field"><label>Date de naissance</label><input id="e-dn" type="date" value="${UI.esc(e.dateNaissance || '')}"></div>
          <div class="field"><label>Lieu de naissance</label><input id="e-ln" value="${UI.esc(e.lieuNaissance || '')}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Matricule</label><input id="e-mat" value="${UI.esc(e.matricule || '')}" placeholder="Auto si vide"></div>
          <div class="field"><label>Classe / Section *</label><select id="e-classe">${UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), e.classeId, 'Choisir…')}</select></div>
        </div>
        <div class="row">
          <div class="field"><label>Tuteur / Responsable</label><input id="e-tuteur" value="${UI.esc(e.tuteur || '')}"></div>
          <div class="field"><label>Téléphone tuteur</label><input id="e-tel" value="${UI.esc(e.telTuteur || '')}"></div>
        </div>
        <div class="field"><label>Type d'élève / étudiant</label><select id="e-type">
          <option value="etatique"${(e.typeEleve || 'etatique') === 'etatique' ? ' selected' : ''}>Étatique</option>
          <option value="prive"${(e.typeEleve || '') === 'prive' ? ' selected' : ''}>Privé</option>
          <option value="cas_social"${(e.typeEleve || '') === 'cas_social' ? ' selected' : ''}>Cas social</option>
        </select>
        <small class="hint">Étatique et Privé paient tous les frais ; Cas social paie uniquement les frais ci-dessous (sinon rien).</small></div>
        <div class="field"><label><input type="checkbox" id="e-disp"${e.dispenseFrais ? ' checked' : ''}> <b>Dispensé(e) des frais scolaires</b> — ne doit pas payer</label>
        <small class="hint">Ce choix est pris en compte dans le suivi des paiements : l'élève sera marqué « Dispensé ».</small></div>
        <div class="field"><div id="e-frais-box" class="${(e.typeEleve || '') === 'cas_social' ? '' : 'hidden'}">
          <label>Frais applicables (cas social)</label>
          ${typesFrais.length ? typesFrais.map(t => '<label style="display:block;font-weight:400"><input type="checkbox" id="e-frais-' + t.id + '"' + ((e.fraisTypesIds || []).indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + UI.esc(t.libelle) + '</label>').join('') : '<span class="hint">Aucun type de frais défini.</span>'}
          <small class="hint">Aucun frais sélectionné = l'élève ne paie rien.</small>
        </div></div>
        <div class="field"><label>Lier à un compte élève existant</label><select id="e-user"><option value="">Créer un compte séparément</option>${UI.options(eleveUsers.map(u => ({ id: u.id, libelle: Data.userName(u) + ' (' + u.username + ')' })), e.userId || '', null)}</select>
          <small class="hint">Pour que l'élève se connecte et consulte son bulletin.</small></div>
        <div class="field"><label>Photo (pour la carte scolaire)</label>
          <div class="photo-edit">
            <div class="photo-preview" id="e-photo-preview">${e.photo ? '<img src="' + UI.esc(e.photo) + '">' : '<span>+</span>'}</div>
            <input type="file" id="e-photo" accept="image/*" style="display:none">
            <button type="button" class="btn btn-sm btn-outline" id="e-photo-btn">${e.photo ? 'Changer la photo' : 'Ajouter une photo'}</button>
            ${e.photo ? '<button type="button" class="btn btn-sm btn-danger" id="e-photo-rm">Retirer</button>' : ''}
          </div>
        </div>
      `, async (body) => {
        const nom = body.querySelector('#e-nom').value.trim();
        const prenom = body.querySelector('#e-prenom').value.trim();
        const classeId = Number(body.querySelector('#e-classe').value);
        if (!nom || !classeId) { UI.toast('Nom et classe requis.', 'err'); return false; }
        const obj = {
          nom, prenom,
          sexe: body.querySelector('#e-sexe').value,
          dateNaissance: body.querySelector('#e-dn').value,
          lieuNaissance: body.querySelector('#e-ln').value.trim(),
          matricule: body.querySelector('#e-mat').value.trim(),
          classeId,
          tuteur: body.querySelector('#e-tuteur').value.trim(),
          telTuteur: body.querySelector('#e-tel').value.trim(),
          typeEleve: body.querySelector('#e-type').value,
          dispenseFrais: !!(body.querySelector('#e-disp') && body.querySelector('#e-disp').checked),
          fraisTypesIds: body.querySelector('#e-type').value === 'cas_social'
            ? typesFrais.filter(t => body.querySelector('#e-frais-' + t.id) && body.querySelector('#e-frais-' + t.id).checked).map(t => t.id)
            : null,
          userId: Number(body.querySelector('#e-user').value) || null,
          photo: prep._photo === undefined ? (e.photo || null) : (prep._photo || null),
          actif: e.actif === undefined ? true : e.actif,
          dateCreation: e.dateCreation || UI.nowIso()
        };
        if (!obj.matricule) {
          const prefix = 'MAT';
          const cnt = (await DB.getAll('eleves')).length + 1;
          obj.matricule = prefix + String(cnt).padStart(5, '0');
        }
        if (e.id) { obj.id = e.id; await DB.put('eleves', obj); }
        else await DB.add('eleves', obj);
        UI.closeModal(); UI.toast(e.id ? 'Élève modifié.' : 'Élève inscrit.', 'ok'); renderList();
        return true;
      });
    // Liaison de la photo dès l'ouverture de la modale
    const prep = m.modal.querySelector('#e-photo-preview');
    const typeSel = m.modal.querySelector('#e-type');
    const fraisBox = m.modal.querySelector('#e-frais-box');
    if (typeSel && fraisBox) typeSel.onchange = () => fraisBox.classList.toggle('hidden', typeSel.value !== 'cas_social');
    m.modal.querySelector('#e-photo-btn').onclick = () => m.modal.querySelector('#e-photo').click();
    m.modal.querySelector('#e-photo').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const url = await UI.fileToDataUrl(f);
      prep.innerHTML = '<img src="' + url + '">';
      prep._photo = url;
    });
    const rm = m.modal.querySelector('#e-photo-rm');
    if (rm) rm.onclick = () => { prep.innerHTML = '<span>+</span>'; prep._photo = ''; };
    }
    // ---------- IMPORT / EXPORT de la liste des élèves ----------
    function download(filename, content, mime) {
      const blob = new Blob([content], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
    }
    function csvCell(v) {
      const s = String(v == null ? '' : v);
      return '"' + s.replace(/"/g, '""') + '"';
    }
    function buildRowsAsync(classeId) {
      const cl = classes.find(c => c.id === classeId);
      return DB.getAll('eleves').then((eleves) => ({
        eleves: eleves.filter(e => e.classeId === classeId).sort((a, b) => (a.nom || '').localeCompare(b.nom || '')),
        cl
      }));
    }
    function exportExcel(eleves, cl) {
      const head = ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Tuteur', 'Tél. tuteur'];
      const trs = eleves.map((e) => '<tr>' +
        '<td>' + (e.matricule || '') + '</td><td>' + (e.nom || '') + '</td><td>' + (e.prenom || '') + '</td>' +
        '<td>' + (e.sexe || '') + '</td><td>' + (e.dateNaissance || '') + '</td><td>' + (e.lieuNaissance || '') + '</td>' +
        '<td>' + (e.tuteur || '') + '</td><td>' + (e.telTuteur || '') + '</td></tr>').join('');
      const ecoName = (school && school.nom) ? school.nom : 'Établissement';
      const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' +
        '<table border="1">' +
        '<tr><th colspan="8" style="font-size:16pt">' + UI.esc(ecoName) + '</th></tr>' +
        '<tr><th colspan="8" style="font-size:14pt">' + (cl ? Data.classeLabel(cl) : '') + ' — Liste des élèves</th></tr>' +
        '<tr>' + head.map((h) => '<th style="background:#ddd">' + h + '</th>').join('') + '</tr>' +
        trs + '</table></body></html>';
      download('eleves_' + (cl ? cl.libelle.replace(/[^a-zA-Z0-9]+/g, '_') : 'classe') + '.xls', html, 'application/vnd.ms-excel');
    }
    function exportCsv(eleves, cl) {
      const head = ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Tuteur', 'Tél. tuteur'];
      const sep = ';';
      const ecoName = (school && school.nom) ? school.nom : 'Établissement';
      const lines = [csvCell(ecoName), head.map(csvCell).join(sep)];
      for (const e of eleves) lines.push([e.matricule, e.nom, e.prenom, e.sexe, e.dateNaissance, e.lieuNaissance, e.tuteur, e.telTuteur].map(csvCell).join(sep));
      // BOM UTF-8 pour Excel
      download('eleves_' + (cl ? cl.libelle.replace(/[^a-zA-Z0-9]+/g, '_') : 'classe') + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    }
    function exportPdf(eleves, cl) {
      const rows = eleves.map((e, i) => '<tr><td>' + (i + 1) + '</td><td>' + (e.nom || '') + ' ' + (e.prenom || '') + '</td>' +
        '<td>' + (e.matricule || '') + '</td><td>' + (e.sexe || '') + '</td>' +
        '<td>' + (e.dateNaissance || '') + '</td><td>' + (e.tuteur || '') + '</td><td>' + (e.telTuteur || '') + '</td></tr>').join('');
      const html = '<div class="page-bulletin" style="width:210mm;margin:0 auto">' +
        UI.letterhead(school, { title: 'Liste des élèves — ' + (cl ? Data.classeLabel(cl) : ''), subtitle: { label: 'Effectif', value: eleves.length + ' élève(s)' } }, {}) +
        '<table class="tbl"><thead><tr><th>#</th><th>Élève</th><th>Matricule</th><th>Sexe</th><th>Naissance</th><th>Tuteur</th><th>Tél.</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>';
      UI.print(html, 'Liste des élèves — ' + (cl ? Data.classeLabel(cl) : ''));
    }

    function openExport() {
      const clSel = classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) }));
      UI.prompt('Exporter la liste des élèves', `
        <div class="field"><label>Classe *</label><select id="ex-classe">${UI.options(clSel, '', 'Choisir…')}</select></div>
        <div class="field"><label>Format</label>
          <select id="ex-format">
            <option value="xls">Excel (.xls)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="pdf">PDF (impression)</option>
          </select></div>
        <small class="hint">Le PDF s'obtient via la boîte d'impression : choisissez « Enregistrer au format PDF ».</small>
      `, async (body) => {
        const classeId = Number(body.querySelector('#ex-classe').value);
        const format = body.querySelector('#ex-format').value;
        if (!classeId) { UI.toast('Choisissez une classe.', 'err'); return false; }
        const { eleves, cl } = await buildRowsAsync(classeId);
        if (!eleves.length) { UI.toast('Aucun élève dans cette classe.', 'err'); return false; }
        if (format === 'xls') exportExcel(eleves, cl);
        else if (format === 'csv') exportCsv(eleves, cl);
        else exportPdf(eleves, cl);
        UI.closeModal();
        return true;
      }, { size: 'modal modal-sm' });
    }

    function readBytes(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(new Uint8Array(r.result));
        r.onerror = reject;
        r.readAsArrayBuffer(file);
      });
    }
    function decode(buf) {
      try { return new TextDecoder('utf-8').decode(buf); }
      catch (e) {
        let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        return s;
      }
    }
    function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
    function parseDelimited(text) {
      // accepte ; ou , et gère les champs entre guillemets
      const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim() !== '');
      if (!lines.length) return [];
      return lines.map((line) => {
        const out = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
          else if (ch === '"') inQ = true;
          else if (ch === ';' || ch === ',') { out.push(cur); cur = ''; }
          else cur += ch;
        }
        out.push(cur);
        return out;
      });
    }
    function xmlElText(el) {
      // récupère le texte d'un <t> en gérant les runs <r><t>
      if (!el) return '';
      const ts = el.getElementsByTagName('t');
      if (!ts.length) return '';
      let s = '';
      for (let i = 0; i < ts.length; i++) s += ts[i].textContent || '';
      return s;
    }
    function colRefToIndex(ref) {
      // "AC12" -> 28
      let c = 0;
      for (let i = 0; i < ref.length; i++) {
        const ch = ref.charCodeAt(i);
        if (ch >= 65 && ch <= 90) c = c * 26 + (ch - 64);
        else break;
      }
      return c - 1;
    }
    function parseXlsxXml(xml) {
      const grid = [];
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const rows = doc.getElementsByTagName('row');
      for (let r = 0; r < rows.length; r++) {
        const rowEl = rows[r];
        const cells = rowEl.getElementsByTagName('c');
        let rowArr = [];
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          const type = c.getAttribute('t') || '';
          const ref = c.getAttribute('r') || '';
          let v = '';
          if (type === 's') {
            const vEl = c.getElementsByTagName('v')[0];
            const idx = vEl ? Number(vEl.textContent) : -1;
            v = (idx >= 0 && sharedStrings[idx] != null) ? sharedStrings[idx] : '';
          } else if (type === 'inlineStr') {
            const is = c.getElementsByTagName('is')[0];
            v = is ? xmlElText(is) : '';
          } else if (type === 'str' || type === 'b' || type === 'e' || type === '') {
            const vEl = c.getElementsByTagName('v')[0];
            v = vEl ? (vEl.textContent || '') : '';
          }
          const ci = ref ? colRefToIndex(ref) : -1;
          if (ci >= 0) { while (rowArr.length <= ci) rowArr.push(''); rowArr[ci] = v; }
          else rowArr.push(v);
        }
        if (rowArr.some((x) => x !== '')) grid.push(rowArr);
      }
      return grid;
    }
    var sharedStrings = [];
    async function inflateDecomp(data) {
      if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream non disponible');
      const stream = new Blob([data.buffer instanceof ArrayBuffer ? data.buffer : new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    function parseZip(buf) {
      // retourne { name: Uint8Array décompressé }
      const out = {};
      const u16 = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      // EOCD : chercher PK\x05\x06 depuis la fin (dans les 65557 derniers octets)
      let eocd = -1;
      const from = Math.max(0, buf.length - 65557);
      for (let i = buf.length - 22; i >= from; i--) {
        if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
      }
      if (eocd < 0) throw new Error('ZIP invalide (pas de fin)');
      const count = u16.getUint16(eocd + 10, true);
      let cd = u16.getUint32(eocd + 16, true);
      for (let n = 0; n < count; n++) {
        if (u8[cd] !== 0x50 || u8[cd + 1] !== 0x4b || u8[cd + 2] !== 0x01 || u8[cd + 3] !== 0x02) break;
        const method = u16.getUint16(cd + 10, true);
        const csize = u16.getUint32(cd + 20, true);
        const usize = u16.getUint32(cd + 24, true);
        const nameLen = u16.getUint16(cd + 28, true);
        const extraLen = u16.getUint16(cd + 30, true);
        const cmtLen = u16.getUint16(cd + 32, true);
        const localOff = u16.getUint32(cd + 42, true);
        let name = '';
        for (let k = 0; k < nameLen; k++) name += String.fromCharCode(u8[cd + 46 + k]);
        // lecture locale
        const dStart = localOff + 30 + u16.getUint16(localOff + 26, true) + u16.getUint16(localOff + 28, true);
        const raw = u8.slice(dStart, dStart + csize);
        if (method === 0) out[name] = raw;
        else if (method === 8) out[name] = raw; // sera décompressé à la demande
        else out[name] = null;
        cd += 46 + nameLen + extraLen + cmtLen;
      }
      return out;
    }
    async function parseXlsx(buf) {
      const zip = parseZip(buf);
      // strings partagées
      sharedStrings = [];
      const sstEntry = zip['xl/sharedStrings.xml'];
      if (sstEntry) {
        let sstXml;
        try { sstXml = decode(await inflateDecomp(sstEntry)); }
        catch (e) { sstXml = decode(sstEntry); }
        const doc = new DOMParser().parseFromString(sstXml, 'text/xml');
        const sis = doc.getElementsByTagName('si');
        for (let i = 0; i < sis.length; i++) sharedStrings.push(xmlElText(sis[i]));
      }
      // première feuille de calcul
      let sheetName = null;
      if (zip['xl/worksheets/sheet1.xml']) sheetName = 'xl/worksheets/sheet1.xml';
      else {
        for (const k in zip) if (k.indexOf('xl/worksheets/sheet') === 0 && k.slice(-4) === '.xml') { sheetName = k; break; }
      }
      if (!sheetName) throw new Error('Aucune feuille de calcul trouvée');
      let sheetXml;
      try { sheetXml = decode(await inflateDecomp(zip[sheetName])); }
      catch (e) { sheetXml = decode(zip[sheetName]); }
      return parseXlsxXml(sheetXml);
    }
    function parseHtmlTable(text) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const table = doc.querySelector('table');
      if (!table) throw new Error('Aucun tableau trouvé dans le fichier.');
      const grid = [];
      for (const tr of table.querySelectorAll('tr')) {
        const row = [];
        for (const cell of tr.querySelectorAll('th,td')) row.push((cell.textContent || '').trim());
        if (row.some((c) => c !== '')) grid.push(row);
      }
      return grid;
    }
    // ---- .xls binaire (BIFF8) minimal ----
    function biffReadStrings(chunks) {
      // chunks : tableaux d'octets (SST + CONTINUE). Renvoie le tableau des chaînes partagées.
      // Lecture naïve : on concatène les octets et on lit chaque chaîne XLUnicodeRichExtendedString
      // en suivant le grbit (unicode), en ignorant les continuations de grbit (fichiers simples).
      const strings = [];
      if (!chunks.length) return strings;
      let gi = 0, gp = 8; // en-tête 8 octets (total + unique)
      function byte() {
        while (gi < chunks.length && gp >= chunks[gi].length) { gi++; gp = 0; }
        if (gi >= chunks.length) throw new Error('SST tronquée');
        return chunks[gi][gp++];
      }
      function readChar(high) {
        return high ? String.fromCharCode((byte() | (byte() << 8)) & 0xFFFF) : String.fromCharCode(byte());
      }
      function rdString() {
        const cch = byte() | (byte() << 8);
        if (cch <= 0) return '';
        const grbit = byte();
        const fHigh = (grbit & 0x01) !== 0;
        const fRich = (grbit & 0x08) !== 0;
        const fPhon = (grbit & 0x10) !== 0;
        let nRun = 0;
        if (fRich) { nRun = byte() | (byte() << 8); }
        let s = '';
        for (let i = 0; i < cch; i++) s += readChar(fHigh);
        if (fRich) for (let i = 0; i < nRun; i++) { byte(); byte(); byte(); byte(); }
        if (fPhon) { const cb = (byte() | (byte() << 8) | (byte() << 16) | (byte() << 24)) >>> 0; for (let i = 0; i < cb; i++) byte(); }
        return s;
      }
      try {
        while (true) strings.push(rdString());
      } catch (e) { /* fin de la table */ }
      return strings;
    }
    function parseXlsBiff(buf) {
      // --- OLE2 ---
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const sectorShift = dv.getUint16(30, true);
      const sec = 1 << sectorShift; // taille de secteur (généralement 512)
      const dirStart = dv.getUint32(48, true);
      const miniShift = dv.getUint16(32, true);
      const miniCutoff = dv.getUint32(56, true);
      // FAT : 109 secteurs DIFAT initiaux
      const fatSectors = [];
      for (let i = 0; i < 109; i++) {
        const s = dv.getUint32(76 + i * 4, true);
        if (s === 0xFFFFFFFE || s === 0xFFFFFFFF) break;
        fatSectors.push(s);
      }
      const fat = new Uint32Array(Math.ceil((u8.length / sec) ) + 4);
      // Dans un fichier CFB, le secteur n°n est à l'offset (512 + n*sec) : l'en-tête
      // de 512 octets n'est PAS le secteur 0.
      const secOff = (n) => 512 + n * sec;
      function readFATSectors() {
        const n = fatSectors.length;
        const perSect = sec / 4;
        for (let si = 0; si < n; si++) {
          const base = secOff(fatSectors[si]);
          for (let i = 0; i < perSect; i++) fat[si * perSect + i] = dv.getUint32(base + i * 4, true);
        }
      }
      readFATSectors();
      function readStream(startSector, size) {
        // lit un flux en suivant la chaîne FAT
        const out = new Uint8Array(size);
        let pos = 0, s = startSector;
        while (s !== 0xFFFFFFFE && s !== 0xFFFFFFFF && pos < size) {
          const base = secOff(s);
          const seg = Math.min(sec, size - pos);
          out.set(u8.slice(base, base + seg), pos);
          pos += seg;
          s = fat[s];
        }
        return out.slice(0, pos);
      }
      // Répertoire
      const dirBytes = readStream(dirStart, sec * 4 * 4);
      const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
      let workStart = -1, workSize = 0;
      for (let e = 0; e * 128 + 128 <= dirBytes.length; e++) {
        const o = e * 128;
        const type = ddv.getUint8(o + 66);
        let name = '';
        const nameLen = ddv.getUint16(o + 64, true);
        for (let i = 0; i + 1 < nameLen - 2 && i + 1 < 64; i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
        const start = ddv.getUint32(o + 116, true);
        const size = ddv.getUint32(o + 120, true) + ddv.getUint32(o + 124, true) * 4294967296;
        if (type === 2 && (name === 'Workbook' || name === 'Book')) { workStart = start; workSize = size; }
      }
      if (workStart < 0) throw new Error('Flux Workbook introuvable');
      const wb = readStream(workStart, workSize);
      // --- BIFF8 : parcours des enregistrements ---
      const wdv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
      const w8 = new Uint8Array(wb.buffer, wb.byteOffset, wb.byteLength);
      const grid = [];
      let sstStrings = [];
      const records = [];
      let pos = 0;
      while (pos + 4 <= wb.length) {
        const id = wdv.getUint16(pos, true);
        const len = wdv.getUint16(pos + 2, true);
        records.push({ id, len, off: pos + 4 });
        pos += 4 + len;
      }
      // Extraire SST (et ses CONTINUE) en premier
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.id === 0x00FC) { // SST
          const cont = [w8.slice(r.off, r.off + r.len)];
          let j = i + 1;
          while (j < records.length && records[j].id === 0x003C) { cont.push(w8.slice(records[j].off, records[j].off + records[j].len)); j++; }
          sstStrings = biffReadStrings(cont);
          break;
        }
      }
      // Puis insérer les cellules (LABELSST, LABEL, NUMBER, RK, MULRK)
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.off + r.len > wb.length) continue;
        const o = r.off;
        if (r.id === 0x00FD) { // LABELSST : row(2) col(2) xf(2) isst(4)
          const row = wdv.getUint16(o, true);
          const col = wdv.getUint16(o + 2, true);
          const isst = wdv.getUint32(o + 6, true);
          setCell(row, col, sstStrings[isst] != null ? sstStrings[isst] : '');
        } else if (r.id === 0x0204) { // LABEL : row col xf puis XLUnicodeString
          const row = wdv.getUint16(o, true);
          const col = wdv.getUint16(o + 2, true);
          let p = o + 6;
          const cch = wdv.getUint16(p, true); p += 2;
          const grbit = w8[p]; p += 1;
          const fHigh = (grbit & 0x01) !== 0;
          let s = '';
          for (let k = 0; k < cch; k++) { if (fHigh) { s += String.fromCharCode(wdv.getUint16(p, true)); p += 2; } else { s += String.fromCharCode(w8[p]); p += 1; } }
          setCell(row, col, s);
        } else if (r.id === 0x027E) { // RK
          const row = wdv.getUint16(o, true);
          const col = wdv.getUint16(o + 2, true);
          const rk = wdv.getUint32(o + 6, true);
          setCell(row, col, fmtNumber(decodeRK(rk)));
        } else if (r.id === 0x00BD) { // MULRK
          const row = wdv.getUint16(o, true);
          let col = wdv.getUint16(o + 2, true);
          let p = o + 4;
          while (p + 6 <= o + r.len - 2) {
            const rk = wdv.getUint32(p + 2, true);
            setCell(row, col, fmtNumber(decodeRK(rk)));
            p += 6; col++;
          }
        } else if (r.id === 0x0203) { // NUMBER
          const row = wdv.getUint16(o, true);
          const col = wdv.getUint16(o + 2, true);
          const d = wdv.getFloat64(o + 6, true);
          setCell(row, col, String(d));
        }
      }
      function setCell(row, col, val) {
        if (row >= grid.length) while (grid.length <= row) grid.push([]);
        grid[row][col] = val;
      }      return grid.filter((r) => r.some((c) => c !== ''));
    }
    function decodeRK(rk) {
      const type = rk & 3;
      if (type === 0 || type === 1) {
        const hi = (rk & 0xFFFFFFFC) >>> 0;
        const fbuf = new ArrayBuffer(8);
        const fdv = new DataView(fbuf);
        fdv.setUint32(0, hi, false);
        fdv.setUint32(4, 0, false);
        let d = fdv.getFloat64(0, false);
        if (type === 1) d /= 100;
        return d;
      } else {
        const iv = (rk >> 2);
        return type === 3 ? iv / 100 : iv;
      }
    }
    function fmtNumber(n) {
      if (typeof n === 'number') {
        if (Number.isInteger(n)) return String(n);
        const round = Math.round(n * 100) / 100;
        if (Math.abs(n - round) < 1e-9) return String(round);
        return String(n);
      }
      return String(n);
    }
    async function spreadsheetToGrid(buf, name) {
      const len = buf.length;
      let kind;
      if (len >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) kind = 'xlsx';
      else if (len >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) kind = 'xlsbiff';
      else kind = 'text';
      if (kind === 'xlsx') {
        const g = await parseXlsx(buf);
        return g.length ? g : [];
      }
      if (kind === 'xlsbiff') return parseXlsBiff(buf);
      // texte : CSV ou HTML exporté
      let text = decode(buf);
      const test = text.replace(/^\uFEFF/, '').trim().slice(0, 200).toLowerCase();
      if (test.indexOf('<table') >= 0 || test.indexOf('<html') >= 0 || test.indexOf('<!doctype') >= 0 || test.indexOf('<tr') >= 0) {
        return parseHtmlTable(text);
      }
      return parseDelimited(text);
    }
    function openImport() {
      const clSel = classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) }));
      UI.prompt('Importer une liste d\'élèves', `
        <div class="field"><label>Classe de destination *</label><select id="im-classe">${UI.options(clSel, '', 'Choisir…')}</select></div>
        <div class="field"><label>Fichier (CSV, .xls ou .xlsx)</label>
          <input type="file" id="im-file" accept=".csv,.xls,.xlsx,.txt" required>
        </div>
        <small class="hint">Formats acceptés : CSV, Microsoft Excel (.xls / .xlsx) ou l'export Excel de l'app. Colones attendues (en-tête facultatif) : Matricule ; Nom ; Prénom ; Sexe ; Naissance ; Lieu ; Tuteur ; Tél.<br>Les élèves déjà présents (même matricule) sont mis à jour.</small>
      `, async (body) => {
        const classeId = Number(body.querySelector('#im-classe').value);
        const file = body.querySelector('#im-file').files[0];
        if (!classeId || !file) { UI.toast('Classe et fichier requis.', 'err'); return false; }
        let grid;
        try {
          const bytes = await readBytes(file);
          grid = await spreadsheetToGrid(bytes, file.name);
        } catch (e) {
          UI.toast('Fichier illisible ou non reconnu (' + ((e && e.message) || e) + ')', 'err');
          return false;
        }
        if (!grid || !grid.length) { UI.toast('Fichier vide.', 'err'); return false; }
        // repérer la ligne d'en-tête (celle qui contient une cellule "Matricule" ou "Nom")
        let start = 0;
        for (let r = 0; r < grid.length; r++) {
          const cells = grid[r].map((c) => String(c == null ? '' : c).trim().toLowerCase());
          if (cells.some((c) => c === 'matricule' || c === 'nom')) { start = r + 1; break; }
        }
        const allEleves = await DB.getAll('eleves');
        let added = 0, updated = 0, skipped = 0;
        for (let i = start; i < grid.length; i++) {
          const row = grid[i];
          const cell = (n) => String(row[n] == null ? '' : row[n]).trim();
          const nom = cell(1);
          if (!nom) continue;
          const sexeRaw = cell(3).toUpperCase();
          const obj = {
            nom: nom,
            prenom: cell(2),
            sexe: sexeRaw === 'F' ? 'F' : (sexeRaw === 'M' ? 'M' : ''),
            dateNaissance: cell(4),
            lieuNaissance: cell(5),
            tuteur: cell(6),
            telTuteur: cell(7),
            classeId: classeId,
            actif: true,
            dateCreation: UI.nowIso()
          };
          const matricule = cell(0);
          if (!matricule) {
            const cnt = allEleves.length + added + 1;
            obj.matricule = 'MAT' + String(cnt).padStart(5, '0');
          } else obj.matricule = matricule;
          const existing = allEleves.find((x) => x.matricule && x.matricule === obj.matricule);
          if (existing) {
            existing.nom = obj.nom; existing.prenom = obj.prenom; existing.sexe = obj.sexe;
            existing.dateNaissance = obj.dateNaissance; existing.lieuNaissance = obj.lieuNaissance;
            existing.tuteur = obj.tuteur; existing.telTuteur = obj.telTuteur; existing.classeId = classeId;
            await DB.put('eleves', existing); updated++;
          } else {
            await DB.add('eleves', obj);
            allEleves.push(obj);
            added++;
          }
        }
        UI.toast(added + ' ajouté(s), ' + updated + ' mis à jour, ' + skipped + ' ignoré(s).', 'ok');
        renderList();
        UI.closeModal();
        return true;
      }, { size: 'modal' });
    }

    root.querySelector('#el-add').onclick = () => formEleve();
    root.querySelector('#el-export').onclick = openExport;
    root.querySelector('#el-import').onclick = openImport;
  }
});
