/* ============================================================
   eval.js — Saisie des notes (classe /20 et composition /40)
   La période d'évaluation est choisie selon le cycle de la classe :
   - cycles post-primaires (Fondamental 2, Secondaire) → trimestres
   - cycles primaires (Préscolaire, Fondamental 1) → compositions (Compo1…)
   ============================================================ */
// Cycles dont les notes sont saisies par trimestre (Fondamental 2, Secondaire)
const TRIMESTRE_CYCLE_RE = /fondamental\s?-?\s?2|secondaire|coll[eè]ge|lyc[eé]e|post[- ]?primaire/i;
// Cycles universitaires : une session par module (matière)
const UNIV_CYCLE_RE = /universit|licence|master|facult[eé]|sup[eé]rieur|ing[eé]nieur/i;
// Cycles primaires (Fondamental 1) : compositions Compo1…CompoN
const COMPO_CYCLE_RE = /fondamental\s?-?\s?1|primaire|elementaire|él[eé]mentaire/i;
// Nombre de compositions pour le cycle Fondamental 1
const COMPO_COUNT = 9;
// Nombre de sessions pour les autres cycles (ex : Préscolaire)
const SESSION_COUNT = 3;

App.register('notes', {
  title: 'Saisie des notes',
  navLabel: 'Notes',
  icon: 'N',
  group: 'Évaluation',
  perm: 'notes.entry',
  render: async function (root, ctx) {
    const u = Auth.currentUser();
    const isTeacher = u.role === 'enseignant';
    root.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Notes de classe et de composition</div></div>' +
      '<div class="filter-bar" id="nt-filters"></div></div>' +
      '<div class="bar" id="nt-body"></div>';
    const filters = root.querySelector('#nt-filters');
    const body = root.querySelector('#nt-body');

    // Choix disponibles selon le rôle
    const [classes, cycles, niveaux, matieres, trimestres, enseignants] = await Promise.all([
      DB.getAll('classes'), DB.getAll('cycles'), DB.getAll('niveaux'), DB.getAll('matieres'), DB.getAll('trimestres'), DB.getAll('enseignants')
    ]);
    const affs = await DB.getAll('affectations');
    const activeTrim = trimestres[0] || null;
    let allowedMats = [];
    if (isTeacher) {
      const me = enseignants.find(en => en.userId === u.id);
      if (me) allowedMats = affs.filter(a => a.enseignantId === me.id);
    }

    let selClasse = ctx && ctx.classeId ? Number(ctx.classeId) : (classes.length ? classes[0].id : null);
    let selMatiere = null;
    let selPeriode = null; // { id, libelle, trimestreId }
    let selType = 'classe';

    // Cycle de la classe sélectionnée (via niveau)
    function cycleOf(classeId) {
      const cl = classes.find(c => c.id === classeId);
      const nv = cl && cl.niveauId ? niveaux.find(n => n.id === cl.niveauId) : null;
      return (nv && nv.cycleId) ? cycles.find(c => c.id === nv.cycleId) || null : null;
    }
    // Type de période selon le cycle : 'trimestres' | 'compos' | 'sessions' | 'univ'
    function periodKindFor(cy) {
      const lib = (cy && cy.libelle) || '';
      if (UNIV_CYCLE_RE.test(lib)) return 'univ';
      if (TRIMESTRE_CYCLE_RE.test(lib)) return 'trimestres';
      if (COMPO_CYCLE_RE.test(lib)) return 'compos';
      return 'sessions';
    }
    // Périodes possibles pour la classe (et la matière sélectionnée pour le cas universitaire)
    function periodsFor(classeId, matId) {
      const cy = cycleOf(classeId);
      const kind = periodKindFor(cy);
      if (kind === 'trimestres') {
        // Trimestres réels s'ils existent, sinon trimestres de repli (école non configurée),
        // partagés avec le module bulletins pour rester cohérents (ids négatifs).
        return Data.effectiveTrimestres(trimestres).map(t => ({ id: 'T' + t.id, libelle: t.libelle, trimestreId: t.id }));
      }
      if (kind === 'compos') {
        const arr = [];
        for (let i = 1; i <= COMPO_COUNT; i++) {
          arr.push({ id: 'C' + i, libelle: 'Compo ' + i, trimestreId: activeTrim ? activeTrim.id : null });
        }
        return arr;
      }
      if (kind === 'univ') {
        // une session par module (matière) : la période = la matière
        const mats = matieresFor(classeId);
        if (matId) return mats.filter(M => M.id === matId).map(M => ({ id: 'U' + M.id, libelle: 'Session — ' + M.libelle, trimestreId: activeTrim ? activeTrim.id : null }));
        return mats.map(M => ({ id: 'U' + M.id, libelle: 'Session — ' + M.libelle, trimestreId: activeTrim ? activeTrim.id : null }));
      }
      // sessions (ex : Préscolaire)
      const arr = [];
      for (let i = 1; i <= SESSION_COUNT; i++) {
        arr.push({ id: 'S' + i, libelle: 'Session ' + i, trimestreId: activeTrim ? activeTrim.id : null });
      }
      return arr;
    }

    function matieresFor(classeId) {
      if (isTeacher) {
        // uniquement les matières affectées à l'enseignant pour cette classe
        return allowedMats.filter(a => a.classeId === classeId).map(a => matieres.find(m => m.id === a.matiereId)).filter(Boolean);
      }
      return affs.filter(a => a.classeId === classeId).map(a => matieres.find(m => m.id === a.matiereId)).filter(Boolean);
    }

    function renderFilters() {
      const cls = classes.filter(c => {
        if (!isTeacher) return true;
        return affs.some(a => a.classeId === c.id && allowedMats.some(x => x.matiereId === a.matiereId));
      });
      if (cls.length && !cls.some(c => c.id === selClasse)) { selClasse = cls[0].id; selPeriode = null; }
      const mats = matieresFor(selClasse);
      if (mats.length && !mats.some(m => m.id === selMatiere)) selMatiere = mats.length ? mats[0].id : null;
      const periods = periodsFor(selClasse, selMatiere);
      if (periods.length && !periods.some(p => p.id === (selPeriode && selPeriode.id))) selPeriode = periods[0];
      filters.innerHTML =
        '<div class="field"><label>Classe</label><select id="nt-classe">' + UI.options(cls.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), selClasse, 'Choisir…') + '</select></div>' +
        '<div class="field"><label>Matière</label><select id="nt-mat">' + UI.options(mats.map(m => ({ id: m.id, libelle: m.libelle })), selMatiere, 'Choisir…') + '</select></div>' +
        '<div class="field"><label>Période</label><select id="nt-per">' + UI.options(periods.map(p => ({ id: p.id, libelle: p.libelle })), selPeriode ? selPeriode.id : '', 'Choisir…') + '</select></div>' +
        '<div class="field"><label>Type</label><select id="nt-type">' + UI.options([{ id: 'classe', libelle: 'Devoir de classe (/20)' }, { id: 'composition', libelle: 'Composition (/40)' }], selType, null) + '</select></div>' +
        '<button class="btn btn-outline" id="nt-import" style="align-self:end" title="Importer les notes depuis un fichier Excel (CSV / .xls / .xlsx)">📥 Importer Excel</button>' +
        '<button class="btn btn-outline" id="nt-template" style="align-self:end" title="Télécharger la grille vierge à remplir">⤓ Modèle</button>' +
        (mats.length ? '' : '<div class="notice-warn notice" style="align-self:end">Aucune matière affectée à cette classe.</div>');
      filters.querySelector('#nt-classe').onchange = () => {
        selClasse = Number(filters.querySelector('#nt-classe').value); selMatiere = null; selPeriode = null;
        renderFilters(); renderNotes();
      };
      filters.querySelector('#nt-mat').onchange = (e) => { selMatiere = Number(e.target.value); selPeriode = null; renderFilters(); renderNotes(); };
      filters.querySelector('#nt-per').onchange = (e) => { const pid = e.target.value; selPeriode = periodsFor(selClasse, selMatiere).find(p => p.id === pid) || null; renderNotes(); };
      filters.querySelector('#nt-type').onchange = (e) => { selType = e.target.value; renderNotes(); };
      const impBtn = filters.querySelector('#nt-import');
      if (impBtn) impBtn.onclick = importNotes;
      const tplBtn = filters.querySelector('#nt-template');
      if (tplBtn) tplBtn.onclick = downloadTemplate;
    }

    function noteKey(evId, matId, type) {
      const pid = selPeriode ? selPeriode.id : '';
      const trimId = selPeriode ? selPeriode.trimestreId : null;
      // Pour un trimestre, la clé reste eleve+matiere+trimestre+type (compat bulletins).
      // Pour une composition primaire, on ajoute la période (periodeId) pour les distinguer.
      return { pid, trimId, type };
    }

    function findNote(allNotes, evId, matId) {
      const k = noteKey(evId, matId, selType);
      const pid = k.pid;
      // compositions (C), sessions (S), modules universitaires (U) : distingués par periodeId
      if (pid && (pid[0] === 'C' || pid[0] === 'S' || pid[0] === 'U')) {
        return allNotes.find(n => n.eleveId === evId && n.matiereId === matId && n.periodeId === pid && n.type === selType);
      }
      return allNotes.find(n => n.eleveId === evId && n.matiereId === matId && n.trimestreId === k.trimId && n.type === selType);
    }

    async function renderNotes() {
      if (!selClasse || !selMatiere || !selPeriode) { body.innerHTML = '<div class="notice">Choisissez une classe, une matière et une période.</div>'; return; }
      const eleves = (await DB.getAll('eleves')).filter(e => e.classeId === selClasse).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
      const allNotes = await DB.getAll('notes');
      if (!eleves.length) { body.innerHTML = '<div class="empty">Aucun élève dans cette classe</div>'; return; }
      let html = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Élève</th><th style="width:140px">Note (' + (selType === 'classe' ? '/20' : '/40') + ')</th></tr></thead><tbody>';
      for (const ev of eleves) {
        const existing = findNote(allNotes, ev.id, selMatiere);
        html += '<tr data-key="' + ev.id + '_' + selMatiere + '_' + (selPeriode.id) + '_' + selType + '"><td><strong>' + UI.esc(Data.personneNom(ev)) + '</strong></td>' +
          '<td><input type="number" step="any" min="0" max="' + (selType === 'classe' ? 20 : 40) + '" class="note-input" data-id="' + ev.id + '" value="' + (existing ? existing.valeur : '') + '" placeholder="—"></td></tr>';
      }
      html += '</tbody></table></div>' +
        '<div class="bar" style="margin-top:14px;display:flex;gap:10px;align-items:center"><b>Les valeurs vides ou non saisies ne sont pas prises en compte.</b>' +
        '<button class="btn btn-ok" id="nt-save">💾 Enregistrer les notes</button></div>';
      body.innerHTML = html;
      const inputs = [...body.querySelectorAll('.note-input')];
      body.querySelector('#nt-save').onclick = () => saveNotes(eleves, inputs);
    }

    async function saveNotes(eleves, inputs) {
      const allNotes = await DB.getAll('notes');
      const pid = selPeriode.id;
      const trimId = selPeriode.trimestreId;
      let changed = 0;
      for (const inp of inputs) {
        const evId = Number(inp.dataset.id);
        const val = inp.value === '' ? null : Number(inp.value);
        let rec = findNote(allNotes, evId, selMatiere);
        if (val === null || isNaN(val)) {
          if (rec) await DB.del('notes', rec.id);
          continue;
        }
        if (val < 0 || val > (selType === 'classe' ? 20 : 40)) { UI.toast('Note hors borne pour ' + Data.personneNom(eleves.find(e => e.id === evId)) + '.', 'err'); continue; }
        if (rec) { rec.valeur = val; rec.type = selType; await DB.put('notes', rec); }
        else {
          const base = { eleveId: evId, matiereId: selMatiere, trimestreId: trimId, type: selType, valeur: val, dateCreation: UI.nowIso() };
          // compositions (C), sessions (S) et modules universitaires (U) : distinguer par periodeId
          if (pid && (pid[0] === 'C' || pid[0] === 'S' || pid[0] === 'U')) base.periodeId = pid;
          await DB.add('notes', base);
        }
        changed++;
      }
      UI.toast(changed + ' note(s) enregistrée(s).', 'ok');
    }

    // ---------- Export du modèle / Import Excel des notes ----------
    function ntDownload(filename, content, mime) {
      const blob = new Blob([content], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
    }
    function ntCsvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

    function downloadTemplate() {
      if (!selClasse || !selMatiere || !selPeriode) { UI.toast('Choisissez d\'abord la classe, la matière et la période.', 'err'); return; }
      const max = selType === 'classe' ? 20 : 40;
      const cl = classes.find(c => c.id === selClasse);
      const ma = matieres.find(m => m.id === selMatiere);
      const sep = ';';
      const head = ['Matricule', 'Nom', 'Prénom', 'Note (/' + max + ')'];
      const tpl = [head.map(ntCsvCell).join(sep)];
      const fname = 'notes_' + (cl ? cl.libelle.replace(/[^a-zA-Z0-9]+/g, '_') : 'classe') + '_' + (ma ? ma.libelle.replace(/[^a-zA-Z0-9]+/g, '_') : '') + '.csv';
      ntDownload(fname, '\uFEFF' + tpl.join('\r\n'), 'text/csv;charset=utf-8');
      UI.toast('Modèle téléchargé : remplissez la colonne Note puis importez-le.', 'ok');
    }

    async function importNotes() {
      if (!selClasse || !selMatiere || !selPeriode) { UI.toast('Choisissez d\'abord la classe, la matière et la période.', 'err'); return; }
      const max = selType === 'classe' ? 20 : 40;
      UI.prompt('Importer les notes (Excel)', `
        <div class="field"><label>Fichier (CSV, .xls ou .xlsx)</label>
          <input type="file" id="nt-file" accept=".csv,.xls,.xlsx,.txt" required>
        </div>
        <small class="hint">
          Formats : CSV, fichier Excel (.xls / .xlsx) ou l'export Excel de l'app.<br>
          Colonnes attendues (en-tête facultatif) : <b>Matricule ; Nom ; Prénom ; Note (/${max})</b>.<br>
          L'import se fait vers : <b>${UI.esc((classes.find(c => c.id === selClasse) || {}).libelle || '')}</b> — <b>${UI.esc((matieres.find(m => m.id === selMatiere) || {}).libelle || '')}</b> — <b>${UI.esc(selPeriode.libelle)}</b> — <b>${selType === 'classe' ? 'Devoir de classe (/20)' : 'Composition (/40)'}</b>.<br>
          Les élèves sont identifiés par matricule, sinon par nom + prénom.
        </small>
      `, async (body) => {
        const file = body.querySelector('#nt-file').files[0];
        if (!file) { UI.toast('Choisissez un fichier.', 'err'); return false; }
        let grid;
        try { grid = await Excel.parse(file); }
        catch (e) { UI.toast('Fichier illisible ou non reconnu (' + ((e && e.message) || e) + ')', 'err'); return false; }
        if (!grid || !grid.length) { UI.toast('Fichier vide.', 'err'); return false; }
        // repérer la ligne d'en-tête
        let start = 0;
        for (let r = 0; r < grid.length; r++) {
          const cells = grid[r].map((c) => String(c == null ? '' : c).trim().toLowerCase());
          if (cells.some((c) => c === 'matricule' || c === 'nom' || c === 'note')) { start = r + 1; break; }
        }
        const allEleves = (await DB.getAll('eleves')).filter(e => e.classeId === selClasse);
        const allNotes = await DB.getAll('notes');
        const pid = selPeriode.id;
        const trimId = selPeriode.trimestreId;
        let inserted = 0, updated = 0, skipped = 0, outOfRange = 0;
        for (let i = start; i < grid.length; i++) {
          const row = grid[i];
          const cell = (n) => String(row[n] == null ? '' : row[n]).trim();
          const matricule = cell(0);
          const nom = cell(1);
          const prenom = cell(2);
          const valRaw = cell(3).replace(',', '.');
          if (!nom && !valRaw) continue;
          const ev = (matricule && allEleves.find(x => x.matricule && String(x.matricule) === matricule))
            || allEleves.find(x => String((x.nom || '') + ' ' + (x.prenom || '')).trim().toLowerCase() === String(nom + ' ' + prenom).trim().toLowerCase());
          if (!ev) { skipped++; continue; }
          if (valRaw === '') continue;
          const val = Number(valRaw);
          if (val == null || isNaN(val) || val < 0 || val > max) { outOfRange++; continue; }
          const rec = allNotes.find(n => {
            if (pid && (pid[0] === 'C' || pid[0] === 'S' || pid[0] === 'U')) return n.eleveId === ev.id && n.matiereId === selMatiere && n.periodeId === pid && n.type === selType;
            return n.eleveId === ev.id && n.matiereId === selMatiere && n.trimestreId === trimId && n.type === selType;
          });
          if (rec) { rec.valeur = val; rec.type = selType; await DB.put('notes', rec); updated++; }
          else {
            const base = { eleveId: ev.id, matiereId: selMatiere, trimestreId: trimId, type: selType, valeur: val, dateCreation: UI.nowIso() };
            if (pid && (pid[0] === 'C' || pid[0] === 'S' || pid[0] === 'U')) base.periodeId = pid;
            await DB.add('notes', base); inserted++;
          }
        }
        UI.toast(inserted + ' ajoutée(s), ' + updated + ' mise(s) à jour, ' + skipped + ' élève(s) non trouvé(s)' + (outOfRange ? ', ' + outOfRange + ' hors borne' : '') + '.', 'ok');
        UI.closeModal();
        renderNotes();
        return true;
      }, { size: 'modal' });
    }

    renderFilters();
    if (selClasse && selMatiere) renderNotes();
    else if (selClasse) renderNotes();
  }
});
