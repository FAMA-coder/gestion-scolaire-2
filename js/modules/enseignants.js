/* ============================================================
   enseignants.js — Enseignants, Matières, Affectations
   ============================================================ */

/* ---------------- MATIÈRES ---------------- */
App.register('matieres', {
  title: 'Matières',
  navLabel: 'Matières',
  icon: 'M',
  group: 'Pédagogie',
  perm: 'matieres.manage',
  render: async function (root) {
    let filter = null;
    root.innerHTML = `
      <div class="bar"><div class="bar-head"><div class="card-title">Matières (par cycle)</div>
        <div class="toolbar">
          <select id="ma-filter" style="width:auto"><option value="">Tous les cycles</option></select>
          <button class="btn btn-outline" id="ma-import">Importer matières</button>
          <button class="btn btn-primary" id="ma-add">+ Nouvelle matière</button>
        </div></div>
      <div class="table-wrap" id="ma-list"></div></div>`;
    const filterEl = root.querySelector('#ma-filter');
    const listEl = root.querySelector('#ma-list');
    const cycles = await DB.getAll('cycles');
    filterEl.innerHTML = UI.options(cycles.map(c => ({ id: c.id, libelle: c.libelle })), '', 'Tous les cycles');
    filterEl.onchange = () => { filter = filterEl.value ? Number(filterEl.value) : null; renderList(); };
    renderList();
    async function renderList() {
      const { matieres, cycles } = await Data.common();
      const rows = matieres
        .filter((m) => !filter || m.cycleId === filter)
        .map((m) => {
          const cy = m.cycleId ? cycles.find(c => c.id === m.cycleId) : null;
          return '<tr><td><strong>' + UI.esc(m.libelle) + '</strong></td>' +
            '<td>' + (cy ? '<span class="badge badge-primary">' + UI.esc(cy.libelle) + '</span>' : '<span class="badge badge-gray">Tous</span>') + '</td>' +
            '<td class="actions-cell">' +
              '<button class="btn btn-sm btn-outline" data-edit="' + m.id + '">Modifier</button>' +
              '<button class="btn btn-sm btn-danger" data-del="' + m.id + '">Suppr.</button>' +
            '</td></tr>';
        }).join('');
      listEl.innerHTML = UI.table(['Matière', 'Cycle', 'Actions'], rows || UI.empty(3));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formMatiere(matieres.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const m = matieres.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer la matière « ' + m.libelle + ' » ?', async () => { await DB.del('matieres', m.id); renderList(); }, { title: 'Supprimer une matière' });
      });
    }
    async function formMatiere(m) {
      const cycles = await DB.getAll('cycles');
      m = m || {};
      const mCycle = m.cycleId || '';
      UI.prompt(m.id ? 'Modifier la matière' : 'Nouvelle matière', `
        <div class="field"><label>Matière (libellé) *</label><input id="ma-lib" value="${UI.esc(m.libelle || '')}" required placeholder="Ex : Mathématiques"></div>
        <div class="field"><label>Cycle</label><select id="ma-cycle">${UI.options(cycles.map(c => ({ id: c.id, libelle: c.libelle })), mCycle, 'Tous les cycles')}</select></div>
        <small class="hint">Le coefficient et les liaisons enseignant/classe se définissent lors de l'affectation (Pédagogie → Affectations).</small>
      `, async (body) => {
        const lib = body.querySelector('#ma-lib').value.trim();
        if (!lib) { UI.toast('Libellé requis.', 'err'); return false; }
        const obj = {
          libelle: lib,
          cycleId: Number(body.querySelector('#ma-cycle').value) || null,
          dateCreation: m.dateCreation || UI.nowIso()
        };
        if (m.id) { obj.id = m.id; await DB.put('matieres', obj); }
        else await DB.add('matieres', obj);
        UI.closeModal(); UI.toast('Matière enregistrée.', 'ok'); renderList();
        return true;
      });
    }
    async function importMatieres() {
      const { cycles, niveaux, matieres } = await Data.common();
      const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const num = (s) => {
        const v = Number(String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.'));
        return (v == null || isNaN(v)) ? null : v;
      };
      const findByName = (list, name) => {
        const n = norm(name);
        if (!n) return null;
        let found = list.find((x) => norm(x.libelle) === n);
        if (!found) found = list.find((x) => norm(x.libelle).indexOf(n) >= 0);
        return found || null;
      };
      const HEAD_WORDS = ['matiere', 'libelle', 'coefficient', 'coef', 'cycle', 'niveau', 'nom', 'discipline', 'intitule'];

      let rows = [];
      const existing = matieres.slice();
      const key = (r) => norm(r.libelle) + '|' + (r.cycleId || 0);
      function classify() {
        for (const r of rows) {
          const exact = existing.find((m) => key(m) === key(r));
          if (exact) {
            r._dup = 'exact'; r._target = exact;
            if (r._action !== 'update' && r._action !== 'add') r._action = 'skip';
          } else {
            const byName = existing.find((m) => norm(m.libelle) === norm(r.libelle));
            if (byName) {
              r._dup = 'name'; r._target = byName;
              if (r._action !== 'update' && r._action !== 'skip') r._action = 'add';
            } else {
              r._dup = 'new'; r._target = null; r._action = 'add';
            }
          }
        }
      }
      function renderPreview(host) {
        classify();
        if (!rows.length) { host.innerHTML = ''; return; }
        const html = rows.map((r, i) => {
          const cy = r.cycleId ? (cycles.find((c) => c.id === r.cycleId) || {}).libelle : (r.cycleName ? '<span class="hint">' + UI.esc(r.cycleName) + ' ?</span>' : '<span class="badge badge-gray">Tous</span>');
          const badge = r._dup === 'exact' ? '<span class="badge badge-danger" title="Matière identique déjà présente dans la base">déjà présente</span>'
            : r._dup === 'name' ? '<span class="badge badge-warn" title="Même libellé mais cycle différent">conflit de cycle</span>'
            : '<span class="badge badge-ok">nouvelle</span>';
          const sel = r._dup === 'new' ? '' :
            '<select class="mi-act" data-idx="' + i + '" style="margin-left:6px" title="Que faire pour cette ligne ?">' +
              '<option value="add"' + (r._action === 'add' ? ' selected' : '') + '>Ajouter quand même</option>' +
              '<option value="update"' + (r._action === 'update' ? ' selected' : '') + '>Mettre à jour</option>' +
              '<option value="skip"' + (r._action === 'skip' ? ' selected' : '') + '>Ignorer</option>' +
            '</select>';
          return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--gray-100)">' +
            '<div style="flex:1;min-width:0"><b>' + UI.esc(r.libelle) + '</b> — coef <b>' + r.coefficient + '</b> — ' + cy + '</div>' +
            badge + sel + '</div>';
        }).join('');
        const newCount = rows.filter((r) => r._dup === 'new').length;
        const dupCount = rows.length - newCount;
        host.innerHTML =
          '<div style="margin-top:4px"><span class="badge badge-ok">' + newCount + ' nouvelle(s)</span>' +
          (dupCount ? ' <span class="badge badge-danger">' + dupCount + ' déjà présente(s)</span>' : '') +
          (rows.some((r) => !r.cycleId) ? ' <span class="hint">certaines sans cycle (classées « Tous »)</span>' : '') +
          (dupCount ? ' <span class="hint">choisissez par ligne : ignorer / mettre à jour / ajouter quand même</span>' : '') + '</div>' +
          '<div style="max-height:260px;overflow:auto;margin-top:6px;font-size:13px">' + html + '</div>';
        host.querySelectorAll('.mi-act').forEach((s) => s.addEventListener('change', () => {
          const r = rows[Number(s.dataset.idx)];
          if (r) r._action = s.value;
        }));
      }
      function setRows(next) {
        rows = (next || []).filter((r) => r.libelle);
        const host = document.querySelector('#mi-preview');
        if (host) renderPreview(host);
      }

      function parsePdfText(text) {
        const out = [];
        const wordsOf = (s) => String(s || '').split(/\s+/).filter(Boolean);
        const extractFromTokens = (tokens) => {
          const res = { libelle: '', coefficient: 1, cycleName: '', niveauName: '' };
          const t = tokens.slice();
          if (!t.length) return res;
          const ci = t.findIndex((x) => /^\d+([.,]\d+)?$/.test(x) && num(x) != null);
          if (ci >= 0) {
            const c = Math.round(num(t[ci]) || 1);
            if (c >= 1 && c <= 20) res.coefficient = c;
            t.splice(ci, 1);
          }
          const matchIndex = (words) => {
            if (!words.length || words.length > t.length) return -1;
            for (let s = 0; s + words.length <= t.length; s++) {
              let ok = true;
              for (let k = 0; k < words.length; k++) if (norm(t[s + k]) !== norm(words[k])) { ok = false; break; }
              if (ok) return s;
            }
            return -1;
          };
          const byLen = (a, b) => wordsOf(b.libelle).length - wordsOf(a.libelle).length;
          const cyCands = cycles.slice().sort(byLen);
          for (const c of cyCands) {
            const w = wordsOf(c.libelle);
            const idx = w.length ? matchIndex(w) : -1;
            if (idx >= 0) { res.cycleName = c.libelle; t.splice(idx, w.length); break; }
          }
          const nvCands = niveaux.slice().sort(byLen);
          for (const c of nvCands) {
            const w = wordsOf(c.libelle);
            const idx = w.length ? matchIndex(w) : -1;
            if (idx >= 0) { res.niveauName = c.libelle; t.splice(idx, w.length); break; }
          }
          res.libelle = t.join(' ').replace(/[().:]+$/g, '').trim();
          return res;
        };
        const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const nl = norm(line);
          if (HEAD_WORDS.indexOf(nl) >= 0) continue;
          if (/^(page\s+\d+)/i.test(nl)) continue;
          if (/^[\d\s.,/%-]+$/.test(nl)) continue;
          const tokens = line.split(/[\s;|\t]+/).filter(Boolean);
          if (!tokens.length) continue;
          if (tokens.every((x) => HEAD_WORDS.indexOf(norm(x)) >= 0)) continue;
          const p = extractFromTokens(tokens);
          if (!p.libelle) continue;
          const cy = p.cycleName ? findByName(cycles, p.cycleName) : null;
          const nv = p.niveauName ? findByName(niveaux, p.niveauName) : null;
          out.push({ libelle: p.libelle, coefficient: p.coefficient, cycleId: cy ? cy.id : null, niveauId: nv ? nv.id : null, cycleName: p.cycleName || '', niveauName: p.niveauName || '' });
        }
        return out;
      }
      function parseExcelGrid(grid) {
        if (!grid || !grid.length) throw new Error('Fichier vide.');
        let headIdx = -1, cols = { libelle: -1, coefficient: -1, cycle: -1, niveau: -1 };
        for (let r = 0; r < Math.min(6, grid.length); r++) {
          const cells = grid[r].map((c) => norm(c));
          if (cells.some((c) => HEAD_WORDS.indexOf(c) >= 0)) { headIdx = r; break; }
        }
        if (headIdx >= 0) {
          grid[headIdx].forEach((c, i) => {
            const n = norm(c);
            if (cols.libelle < 0 && (n === 'matiere' || n === 'libelle' || n === 'nom' || n === 'discipline' || n === 'intitule')) cols.libelle = i;
            else if (cols.coefficient < 0 && n.indexOf('coef') === 0) cols.coefficient = i;
            else if (n === 'cycle' && cols.cycle < 0) cols.cycle = i;
            else if (n === 'niveau' && cols.niveau < 0) cols.niveau = i;
          });
        }
        if (cols.libelle < 0) cols.libelle = 0;
        const out = [];
        for (let r = headIdx >= 0 ? headIdx + 1 : 0; r < grid.length; r++) {
          const rowArr = grid[r];
          const cell = (i) => String(rowArr[i] == null ? '' : rowArr[i]).trim();
          const libelle = cell(cols.libelle);
          if (!libelle) continue;
          const coefficient = (cols.coefficient >= 0 && num(cell(cols.coefficient)) != null) ? Math.max(1, Math.round(num(cell(cols.coefficient)))) : 1;
          const cy = cols.cycle >= 0 ? findByName(cycles, cell(cols.cycle)) : null;
          const nv = cols.niveau >= 0 ? findByName(niveaux, cell(cols.niveau)) : null;
          out.push({ libelle: libelle, coefficient: coefficient, cycleId: cy ? cy.id : null, niveauId: nv ? nv.id : null, cycleName: cols.cycle >= 0 ? cell(cols.cycle) : '', niveauName: cols.niveau >= 0 ? cell(cols.niveau) : '' });
        }
        return out;
      }
      async function parseFile(file) {
        if (/\.pdf$/i.test(file.name)) return parsePdfText(await PDF.text(file));
        return parseExcelGrid(await Excel.parse(file));
      }
      function startParse(file) {
        const isPdf = /\.pdf$/i.test(file.name);
        const note = document.querySelector('#mi-preview');
        if (note) note.innerHTML = isPdf ? 'Extraction du texte du PDF…' : 'Lecture du fichier…';
        parseFile(file).then((next) => setRows(next)).catch((e) => {
          rows = [];
          const n = document.querySelector('#mi-preview');
          if (n) n.innerHTML = '<span style="color:#dc2626">' + UI.esc('Fichier illisible ou non reconnu' + ((e && e.message) ? ' (' + e.message + ')' : '') + '.') + '</span>';
        });
      }
      async function performImport() {
        if (!rows.length) { UI.toast('Détectez d\'abord des matières dans le fichier.', 'err'); return false; }
        let inserted = 0, updated = 0, skipped = 0;
        const addNew = async (r) => {
          await DB.add('matieres', {
            libelle: r.libelle,
            coefficient: Math.max(1, r.coefficient || 1),
            cycleId: r.cycleId || null,
            niveauId: r.niveauId || null,
            dateCreation: UI.nowIso()
          });
          existing.push({ libelle: r.libelle, coefficient: Math.max(1, r.coefficient || 1), cycleId: r.cycleId || null, niveauId: r.niveauId || null });
        };
        for (const r of rows) {
          const act = r._action || 'add';
          if (act === 'skip') { skipped++; continue; }
          const target = r._target || existing.find((m) => key(m) === key(r));
          if (act === 'update' && target) {
            Object.assign(target, {
              libelle: r.libelle,
              coefficient: Math.max(1, r.coefficient || 1),
              cycleId: r.cycleId || null,
              niveauId: r.niveauId || null
            });
            await DB.put('matieres', target);
            updated++;
          } else if (act === 'update') {
            skipped++;
          } else {
            await addNew(r);
            inserted++;
          }
        }
        UI.toast(inserted + ' matière(s) importée(s)' + (updated ? ', ' + updated + ' mise(s) à jour' : '') + (skipped ? ', ' + skipped + ' ignorée(s)' : '') + '.', 'ok');
        UI.closeModal();
        renderList();
        return true;
      }

      UI.prompt('Importer les matières (Excel / PDF)', `
        <div class="field"><label>Fichier (.xlsx, .xls, .csv, .pdf)</label>
          <input type="file" id="mi-file" accept=".csv,.xls,.xlsx,.pdf,.txt" required>
        </div>
        <div id="mi-preview" class="hint"></div>
        <small class="hint">
          <b>Excel / CSV</b> : colonnes reconnues — Matière (ou Libellé), Coefficient, Cycle, Niveau (en-tête facultatif).<br>
          <b>PDF</b> : liste imprimée des matières, une matière par ligne.<br>
          Les lignes déjà présentes sont signalées — choisissez par ligne : <b>Ignorer</b>, <b>Mettre à jour</b> ou <b>Ajouter quand même</b>.
        </small>
      `, async (body) => {
        const file = body.querySelector('#mi-file').files[0];
        if (!file) { UI.toast('Choisissez un fichier.', 'err'); return false; }
        if (!rows.length) {
          try { setRows(await parseFile(file)); }
          catch (e) { UI.toast('Fichier illisible ou non reconnu.', 'err'); return false; }
        }
        return performImport();
      }, { size: 'modal modal-lg', okLabel: 'Importer' });

      const fi = document.querySelector('#mi-file');
      if (fi) fi.addEventListener('change', () => { const f = fi.files[0]; if (f) startParse(f); });
    }
    root.querySelector('#ma-add').onclick = () => formMatiere();
    root.querySelector('#ma-import').onclick = () => importMatieres();
  }
});

/* ---------------- ENSEIGNANTS ---------------- */
App.register('enseignants', {
  title: 'Enseignants',
  navLabel: 'Enseignants',
  icon: 'P',
  group: 'Pédagogie',
  perm: 'enseignants.manage',
  render: async function (root) {
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Enseignants</div>' +
      '<div class="toolbar"><input type="text" id="en-search" placeholder="Rechercher…" style="width:200px">' +
      '<button class="btn btn-primary" id="en-add">+ Nouvel enseignant</button></div></div>' +
      '<div class="table-wrap" id="en-list"></div></div>';
    const listEl = root.querySelector('#en-list');
    const searchEl = root.querySelector('#en-search');
    searchEl.oninput = renderList;
    renderList();
    async function renderList() {
      const { enseignants, affectations, matieres } = await Data.common();
      const q = searchEl.value.trim().toLowerCase();
      const rows = enseignants
        .filter((e) => !q || Data.personneNom(e).toLowerCase().indexOf(q) >= 0)
        .map((e) => {
          const affs = affectations.filter(a => a.enseignantId === e.id);
          const matNoms = affs.map(a => { const m = matieres.find(mm => mm.id === a.matiereId); return m ? m.libelle : null; }).filter(Boolean);
          return '<tr><td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
            '<td>' + UI.esc(e.matricule || '–') + '</td>' +
            '<td>' + UI.esc(e.telephone || '–') + '</td>' +
            '<td>' + (e.specialite || '–') + '</td>' +
            '<td class="num">' + (Number(e.tauxHoraire) > 0 ? UI.money(e.tauxHoraire) + '/h' : '<span class="badge badge-warn">—</span>') + '</td>' +
            '<td>' + (matNoms.length ? matNoms.map(m => '<span class="badge badge-info">' + UI.esc(m) + '</span>').join(' ') : '<span class="badge badge-gray">Aucune</span>') + '</td>' +
            '<td class="actions-cell">' +
              '<button class="btn btn-sm btn-outline" data-edt="' + e.id + '">Emploi</button>' +
              '<button class="btn btn-sm btn-outline" data-edit="' + e.id + '">Modifier</button>' +
              '<button class="btn btn-sm btn-danger" data-del="' + e.id + '">Suppr.</button>' +
            '</td></tr>';
        }).join('');
      listEl.innerHTML = UI.table(['Nom', 'Matricule', 'Téléphone', 'Spécialité', 'Taux (FCFA/h)', 'Matières enseignées', 'Actions'], rows || UI.empty(7));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formEnseignant(enseignants.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-edt]').forEach((b) => b.onclick = () => App.go('emplois', { enseignantId: Number(b.dataset.edt) }));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const e = enseignants.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer l\'enseignant « ' + Data.personneNom(e) + ' » (et ses affectations) ?', async () => {
          const affs = await DB.getAll('affectations');
          for (const a of affs.filter(x => x.enseignantId === e.id)) await DB.del('affectations', a.id);
          await DB.del('enseignants', e.id); renderList();
        }, { title: 'Supprimer un enseignant' });
      });
    }
    async function formEnseignant(e) {
      const users = await DB.getAll('users');
      const allEns = await DB.getAll('enseignants');
      e = e || {};
      const ensUsers = users.filter(u => u.role === 'enseignant' && !allEns.some(x => x.userId === u.id && x.id !== e.id));
      UI.prompt(e.id ? 'Modifier l\'enseignant' : 'Nouvel enseignant', `
        <div class="row">
          <div class="field"><label>Nom *</label><input id="en-nom" value="${UI.esc(e.nom || '')}" required></div>
          <div class="field"><label>Prénom</label><input id="en-prenom" value="${UI.esc(e.prenom || '')}"></div>
        </div>
        <div class="row-3">
          <div class="field"><label>Sexe</label><select id="en-sexe">${UI.options([{id:'M',libelle:'Masculin'},{id:'F',libelle:'Féminin'}], e.sexe || '', '—')}</select></div>
          <div class="field"><label>Téléphone</label><input id="en-tel" value="${UI.esc(e.telephone || '')}"></div>
          <div class="field"><label>Matricule</label><input id="en-mat" value="${UI.esc(e.matricule || '')}"></div>
        </div>
        <div class="field"><label>Spécialité / Diplôme</label><input id="en-spec" value="${UI.esc(e.specialite || '')}"></div>
        <div class="field"><label>Taux horaire (FCFA par heure)</label><input id="en-taux" type="number" min="0" step="any" value="${Number(e.tauxHoraire) > 0 ? e.tauxHoraire : ''}" placeholder="Ex : 2000">
          <small class="hint">Utilisé pour calculer les honoraires de l'enseignant sur la base du pointage des heures de cours effectuées.</small></div>
        <div class="field"><label>Capacité hebdomadaire (h / semaine)</label><input id="en-cap" type="number" min="0" step="0.5" value="${Number(e.capaciteHebdo) > 0 ? e.capaciteHebdo : ''}" placeholder="Ex : 24">
          <small class="hint">Charge horaire hebdomadaire normale de l'enseignant — sert au contrôle de sa charge vs heures octroyées (défaut : 24 h).</small></div>
        <div class="field"><label>Lier à un compte enseignant existant</label><select id="en-user"><option value="">Créer un compte séparément</option>${UI.options(ensUsers.map(u => ({ id: u.id, libelle: Data.userName(u) + ' (' + u.username + ')' })), e.userId || '', null)}</select>
          <small class="hint">Pour que l'enseignant se connecte et saisisse ses notes.</small></div>
      `, async (body) => {
        const nom = body.querySelector('#en-nom').value.trim();
        if (!nom) { UI.toast('Nom requis.', 'err'); return false; }
        const obj = {
          nom,
          prenom: body.querySelector('#en-prenom').value.trim(),
          sexe: body.querySelector('#en-sexe').value,
          telephone: body.querySelector('#en-tel').value.trim(),
          matricule: body.querySelector('#en-mat').value.trim(),
          specialite: body.querySelector('#en-spec').value.trim(),
          tauxHoraire: (Number(body.querySelector('#en-taux').value) > 0 ? Number(body.querySelector('#en-taux').value) : null),
          capaciteHebdo: (Number(body.querySelector('#en-cap').value) > 0 ? Number(body.querySelector('#en-cap').value) : null),
          userId: Number(body.querySelector('#en-user').value) || null,
          dateCreation: e.dateCreation || UI.nowIso()
        };
        if (e.id) { obj.id = e.id; await DB.put('enseignants', obj); }
        else await DB.add('enseignants', obj);
        UI.closeModal(); UI.toast('Enseignant enregistré.', 'ok'); renderList();
        return true;
      });
    }
    root.querySelector('#en-add').onclick = () => formEnseignant();
  }
});

/* ---------------- AFFECTATIONS (enseignant ↔ matière ↔ classe) ---------------- */
App.register('affectations', {
  title: 'Affectations',
  navLabel: 'Affectations',
  icon: 'A',
  group: 'Pédagogie',
  perm: 'affectations.manage',
  render: async function (root) {
    let filter = null;
    root.innerHTML = `
      <div class="bar"><div class="bar-head"><div class="card-title">Affectation enseignants / matières / classes</div>
        <div class="toolbar">
          <select id="af-filter" style="width:auto"><option value="">Toutes les classes</option></select>
          <button class="btn btn-primary" id="af-add">+ Affecter</button>
        </div></div>
      <div class="table-wrap" id="af-list"></div></div>`;
    const filterEl = root.querySelector('#af-filter');
    const listEl = root.querySelector('#af-list');
    const classes = await DB.getAll('classes');
    filterEl.innerHTML = UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), '', 'Toutes les classes');
    filterEl.onchange = () => { filter = filterEl.value ? Number(filterEl.value) : null; renderList(); };
    renderList();
    async function renderList() {
      const { affectations, enseignants, matieres, classes, niveaux, cycles } = await Data.common();
      const fmtH = (n) => { const s = Number(n); return (s % 1 === 0 ? String(s) : String(s).replace('.', ',')); };
      const volCell = (v) => {
        if (!v) return '<span class="badge badge-gray">—</span>';
        const labs = [['hebdo', 'sem'], ['mensuel', 'mois'], ['trimestriel', 'trim'], ['semestriel', 'sem'], ['annuel', 'an'], ['session', 'session']];
        const parts = labs.filter(([k]) => v[k] != null && Number(v[k]) > 0).map(([k, lab]) => '<span class="badge badge-info" title="' + k + '">' + fmtH(v[k]) + ' h/' + lab + '</span>');
        return parts.length ? parts.join(' ') : '<span class="badge badge-gray">—</span>';
      };
      const dursCell = (durs) => (durs && durs.length ? durs.map(d => '<span class="badge badge-gray">' + fmtH(d) + ' h</span>').join(' ') : '<span class="badge badge-gray">—</span>');
      const rows = affectations
        .filter((a) => !filter || a.classeId === filter)
        .map((a) => {
          const en = enseignants.find(x => x.id === a.enseignantId);
          const ma = matieres.find(x => x.id === a.matiereId);
          const cl = classes.find(x => x.id === a.classeId);
          const nv = cl ? niveaux.find(n => n.id === cl.niveauId) : null;
          const cy = nv ? cycles.find(c => c.id === nv.cycleId) : null;
          return '<tr><td><strong>' + UI.esc(en ? Data.personneNom(en) : '—') + '</strong></td>' +
            '<td>' + UI.esc(ma ? ma.libelle : '—') + '</td>' +
            '<td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td>' +
            '<td>' + (cy ? '<span class="badge badge-primary">' + UI.esc(cy.libelle) + '</span>' : '') + '</td>' +
            '<td>' + (a.coefficient || (ma ? (ma.coefficient || 1) : '')) + '</td>' +
            '<td>' + volCell(a.volumes) + '</td>' +
            '<td>' + dursCell(a.durees) + '</td>' +
            '<td class="actions-cell">' +
              '<button class="btn btn-sm btn-outline" data-edit="' + a.id + '">Modifier</button>' +
              '<button class="btn btn-sm btn-danger" data-del="' + a.id + '">Retirer</button>' +
            '</td></tr>';
        }).join('');
      listEl.innerHTML = UI.table(['Enseignant', 'Matière', 'Classe', 'Cycle', 'Coef.', 'Volumes (h)', 'Durées cours (h)', 'Actions'], rows || UI.empty(8));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formAffectation(affectations.find(x => x.id === Number(b.dataset.edit))));
      listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        const a = affectations.find(x => x.id === Number(b.dataset.del));
        UI.confirm('Retirer cette affectation ?', async () => { await DB.del('affectations', a.id); renderList(); }, { title: 'Retirer une affectation' });
      });
    }
    async function formAffectation(a) {
      const { enseignants, matieres, classes } = await Data.common();
      a = a || {};
      const v = a.volumes || {};
      const vIn = (k) => (v[k] != null && Number(v[k]) > 0 ? v[k] : '');
      const durs = (a.durees && a.durees.length ? a.durees : [1]);
      UI.prompt(a.id ? 'Modifier l\'affectation' : 'Nouvelle affectation', `
        <div class="field"><label>Enseignant *</label><select id="af-ens">${UI.options(enseignants.map(e => ({ id: e.id, libelle: Data.personneNom(e) })), a.enseignantId || '', 'Choisir…')}</select></div>
        <div class="field"><label>Spécialité de l'enseignant</label><input id="af-spec" value="" readonly placeholder="Sélectionnez un enseignant"></div>
        <div class="row">
          <div class="field"><label>Matière *</label><select id="af-mat">${UI.options(matieres.map(m => ({ id: m.id, libelle: m.libelle })), a.matiereId || '', 'Choisir…')}</select></div>
          <div class="field"><label>Coefficient (dans cette classe) *</label><input id="af-coef" type="number" min="1" step="any" value="${a.coefficient || 1}" required></div>
        </div>
        <div class="field"><label>Classe *</label><select id="af-cl">${UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), a.classeId || '', 'Choisir…')}</select></div>
        <div class="field"><label>Volumes horaires (en heures)</label>
          <div class="row-3">
            <div class="field"><label>Hebdomadaire</label><input id="af-v-hebdo" type="number" min="0" step="any" value="${vIn('hebdo')}"></div>
            <div class="field"><label>Mensuel</label><input id="af-v-mensuel" type="number" min="0" step="any" value="${vIn('mensuel')}"></div>
            <div class="field"><label>Trimestriel</label><input id="af-v-trim" type="number" min="0" step="any" value="${vIn('trimestriel')}"></div>
          </div>
          <div class="row-3">
            <div class="field"><label>Semestriel</label><input id="af-v-sem" type="number" min="0" step="any" value="${vIn('semestriel')}"></div>
            <div class="field"><label>Annuel</label><input id="af-v-annuel" type="number" min="0" step="any" value="${vIn('annuel')}"></div>
            <div class="field"><label>Session / module</label><input id="af-v-session" type="number" min="0" step="any" value="${vIn('session')}"></div>
          </div>
        </div>
        <div class="field"><label>Durée des cours (en heures)</label>
          <div id="af-dures"></div>
          <button type="button" class="btn btn-sm btn-outline" id="af-adddur">+ Ajouter une durée</button>
          <small class="hint" style="display:block;margin-top:4px">Une même matière peut avoir plusieurs cours de durées différentes (ex : une séance de 1 h et une de 1,5 h).</small>
        </div>
        <small class="hint">Coefficient, volumes et durées de cours s'appliquent à cette matière dans cette classe.</small>
      `, async (body) => {
        const num = (sel) => { const val = Number(document.querySelector(sel).value); return (val > 0 ? val : null); };
        const ensId = Number(body.querySelector('#af-ens').value);
        const matId = Number(body.querySelector('#af-mat').value);
        const clId = Number(body.querySelector('#af-cl').value);
        const coef = Number(body.querySelector('#af-coef').value);
        if (!ensId || !matId || !clId || !coef || coef < 1) { UI.toast('Renseignez tous les champs (coefficient ≥ 1).', 'err'); return false; }
        const volumes = {
          hebdo: num('#af-v-hebdo'),
          mensuel: num('#af-v-mensuel'),
          trimestriel: num('#af-v-trim'),
          semestriel: num('#af-v-sem'),
          annuel: num('#af-v-annuel'),
          session: num('#af-v-session')
        };
        const durees = Array.from(document.querySelectorAll('#af-dures input')).map(inp => Number(inp.value)).filter(vv => vv > 0);
        const affs = await DB.getAll('affectations');
        if (affs.some(x => x.enseignantId === ensId && x.matiereId === matId && x.classeId === clId && x.id !== a.id)) { UI.toast('Cette affectation existe déjà.', 'err'); return false; }
        const obj = { enseignantId: ensId, matiereId: matId, classeId: clId, coefficient: coef, volumes, durees, dateCreation: a.dateCreation || UI.nowIso() };
        if (a.id) { obj.id = a.id; await DB.put('affectations', obj); }
        else await DB.add('affectations', obj);
        UI.closeModal(); UI.toast(a.id ? 'Affectation mise à jour.' : 'Affectation créée (coef ' + coef + ').', 'ok'); renderList();
        return true;
      });
      // pré-remplir la spécialité selon l'enseignant
      const ensSel = document.querySelector('#af-ens');
      const specInp = document.querySelector('#af-spec');
      const prefillSpec = () => {
        const en = enseignants.find((x) => x.id === Number(ensSel.value));
        specInp.value = en && en.specialite ? en.specialite : '';
      };
      if (ensSel && specInp) { ensSel.addEventListener('change', prefillSpec); prefillSpec(); }
      // coefficient pré-rempli selon la matière (à la création)
      const matSel = document.querySelector('#af-mat');
      const coefInp = document.querySelector('#af-coef');
      const prefillCoef = () => {
        if (a.id) return;
        const ma = matieres.find((x) => x.id === Number(matSel.value));
        if (ma) coefInp.value = ma.coefficient || 1;
      };
      if (matSel && coefInp) { matSel.addEventListener('change', prefillCoef); prefillCoef(); }
      // liste des durées de cours (ajout / retrait)
      const durHost = document.querySelector('#af-dures');
      const addDur = document.querySelector('#af-adddur');
      const makeDurRow = (val) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
        div.innerHTML = '<input type="number" min="0.25" step="0.25" value="' + val + '" style="width:110px">' +
          '<button type="button" class="btn btn-sm btn-ghost" title="Retirer">✕</button>';
        div.querySelector('button').onclick = () => { div.remove(); if (!durHost.querySelectorAll('input').length) addDur.click(); };
        return div;
      };
      const renderDures = () => {
        durHost.innerHTML = '';
        const cur = Array.from(durHost.querySelectorAll('input')).map(inp => inp.value).filter(vv => vv !== '');
        const vals = cur.length ? cur : durs;
        vals.forEach((d) => durHost.appendChild(makeDurRow(d)));
      };
      if (addDur) addDur.onclick = () => durHost.appendChild(makeDurRow('1'));
      if (durHost) renderDures();
    }
    root.querySelector('#af-add').onclick = () => formAffectation();
  }
});
