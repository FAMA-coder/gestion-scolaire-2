/* ============================================================
   bulletins.js — Génération & impression des bulletins
   Formule (colonne par colonne) :
     1. Matières
     2. Moyenne de classe  (devoirs)  /20
     3. Moyenne de composition        /40
     4. Moyenne matière = (moyenne de classe + moyenne de composition) / 3   (note sur 20)
     5. Coefficient de la matière
     6. Moyenne coefficientée = moyenne matière × coefficient
     7. Appréciation
   Moyenne générale = Σ (moyenne coefficientée) ÷ Σ (coefficients)
   ============================================================ */
window.Bulletins = (function () {
  function appreciation(val20) {
    if (val20 >= 16) return 'Très bien';
    if (val20 >= 14) return 'Bien';
    if (val20 >= 12) return 'Assez bien';
    if (val20 >= 10) return 'Passable';
    if (val20 >= 8) return 'Insuffisant';
    return 'Très insuffisant';
  }
  function mention(g) {
    if (g >= 16) return 'Très bien';
    if (g >= 14) return 'Bien';
    if (g >= 12) return 'Assez bien';
    if (g >= 10) return 'Passable';
    return 'Insuffisant';
  }
  function avg(arr) {
    const vals = arr.filter((v) => v != null && !isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + Number(v), 0) / vals.length;
  }
  // Calcule la ligne bulletin d'un élève pour (trimestre) sur les matières enseignées dans la classe
  async function computeStudent(eleve, classeId, trimestreId) {
    const [matieres, affs, notes] = await Promise.all([DB.getAll('matieres'), DB.getAll('affectations'), DB.getAll('notes')]);
    const trims = await DB.getAll('trimestres');
    const trim = Data.trimById(trims, trimestreId, null);
    const exams = trim && trim.examen ? true : false;
    const matsOfClass = affs.filter(a => a.classeId === classeId).map(a => matieres.find(m => m.id === a.matiereId)).filter(Boolean);
    const coefByMatiere = {};
    affs.filter(a => a.classeId === classeId).forEach((a) => {
      const ma = matieres.find(m => m.id === a.matiereId);
      if (ma) coefByMatiere[ma.id] = a.coefficient || ma.coefficient || 1;
    });
    const seen = {};
    const uniqueMats = matsOfClass.filter(m => { if (seen[m.id]) return false; seen[m.id] = true; return true; });
    const rows = [];
    let sumCoef = 0, sumCoefVal = 0, nbNotes = 0;
    for (const m of uniqueMats) {
      const myNotes = notes.filter(n => n.eleveId === eleve.id && n.matiereId === m.id && n.trimestreId === trimestreId);
      const moyClasse = avg(myNotes.filter(n => n.type === 'classe').map(n => n.valeur));
      const moyCompo = avg(myNotes.filter(n => n.type === 'composition').map(n => n.valeur));
      let moyMatiere = null;
      if (moyClasse != null || moyCompo != null) {
        moyMatiere = ((moyClasse || 0) + (moyCompo || 0)) / 3;
      }
      const coef = coefByMatiere[m.id] || m.coefficient || 1;
      const coefVal = moyMatiere != null ? moyMatiere * coef : null;
      if (moyMatiere != null) { sumCoef += coef; sumCoefVal += coefVal; nbNotes++; }
      rows.push({
        matiere: m.libelle, coef,
        moyClasse, moyCompo, moyMatiere, coefVal,
        appreciation: moyMatiere != null ? appreciation(moyMatiere) : ''
      });
    }
    const gen = sumCoef > 0 ? sumCoefVal / sumCoef : null;
    return {
      eleve, rows, sommeCoef: sumCoef, sommeCoefVal: sumCoefVal,
      moyenneGenerale: gen, mention: gen != null ? mention(gen) : '', nbNotes
    };
  }
  // Calcule le rang (classement) de chaque élève d'une classe pour un trimestre,
  // basé sur la moyenne générale (rangs ex-aequo partagés). Renvoie la liste triée
  // avec rang effectif ajoutés aux résultats.
  function rank(results) {
    const sorted = results.slice().sort((a, b) => (b.moyenneGenerale == null ? -1 : b.moyenneGenerale) - (a.moyenneGenerale == null ? -1 : a.moyenneGenerale));
    const effectif = sorted.length;
    let rank = 0;
    let prev = null;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      r.effectif = effectif;
      if (r.moyenneGenerale == null) { r.rank = null; continue; }
      if (prev === null || r.moyenneGenerale !== prev) rank = i + 1;
      r.rank = rank;
      prev = r.moyenneGenerale;
    }
    return sorted;
  }
  // Résultats classés de toute une classe pour un trimestre (rang ex-aequo partagé).
  async function classResults(classeId, trimestreId) {
    const eleves = (await DB.getAll('eleves')).filter(e => e.classeId === classeId);
    return rank(await Promise.all(eleves.map(e => computeStudent(e, classeId, trimestreId))));
  }
  // Classe complète d'un élève : rang = position de l'élève dans sa classe.
  async function rankOf(eleve, classeId, trimestreId) {
    const results = await classResults(classeId, trimestreId);
    return results.find(r => r.eleve.id === eleve.id) || null;
  }
  return { computeStudent: computeStudent, rank: rank, rankOf: rankOf, classResults: classResults, appreciation: appreciation, mention: mention };
})();

App.register('bulletins', {
  title: 'Bulletins',
  navLabel: 'Bulletins',
  icon: 'B',
  group: 'Évaluation',
  perm: 'bulletins.view',
  render: async function (root, ctx) {
    const u = Auth.currentUser();
    const isStudent = u.role === 'eleve';
    root.innerHTML = '<div class="bar"><div class="card-title">Bulletins</div><div class="filter-bar" id="bl-filters"></div></div><div class="bar" id="bl-body"></div>';
    const filters = root.querySelector('#bl-filters');
    const body = root.querySelector('#bl-body');

    if (isStudent) { await renderMyBulletin(); return; }

    const classes = await DB.getAll('classes');
    const trimestres = await DB.getAll('trimestres');
    const effTrims = Data.effectiveTrimestres(trimestres);
    let selClasse = ctx && ctx.classeId ? Number(ctx.classeId) : (classes.length ? classes[0].id : null);
    let selTrim = effTrims.length ? effTrims[0].id : null;
    renderFilters();
    function renderFilters() {
      filters.innerHTML =
        '<div class="field"><label>Classe</label><select id="bl-classe">' + UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), selClasse, 'Choisir…') + '</select></div>' +
        '<div class="field"><label>Trimestre</label><select id="bl-trim">' + UI.options(effTrims.map(t => ({ id: t.id, libelle: t.libelle })), selTrim, 'Choisir…') + '</select></div>' +
        '<button class="btn btn-outline" id="bl-view" style="align-self:end">Aperçu</button>' +
        '<button class="btn btn-ok" id="bl-print" style="align-self:end">Imprimer la classe</button>';
      filters.querySelector('#bl-classe').onchange = (e) => { selClasse = Number(e.target.value); };
      filters.querySelector('#bl-trim').onchange = (e) => { selTrim = Number(e.target.value); };
      filters.querySelector('#bl-view').onclick = renderList;
      filters.querySelector('#bl-print').onclick = printClass;
    }

    async function elevesDeClasse() {
      const eleves = (await DB.getAll('eleves')).filter(e => e.classeId === selClasse).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
      return eleves;
    }

    async function renderList() {
      if (!selClasse) { body.innerHTML = '<div class="notice">Choisissez une classe.</div>'; return; }
      body.innerHTML = '<div class="empty">Calcul en cours…</div>';
      const eleves = await elevesDeClasse();
      const results = [];
      for (const ev of eleves) results.push(await Bulletins.computeStudent(ev, selClasse, selTrim));
      const ranked = Bulletins.rank(results);
      const rows = ranked.map((r) => {
        return '<tr><td>' + (r.moyenneGenerale != null ? r.rank + ' / ' + r.effectif : '–') + '</td><td><strong>' + UI.esc(Data.personneNom(r.eleve)) + '</strong></td>' +
          '<td><button class="btn btn-sm btn-outline" data-view="' + r.eleve.id + '">Bulletin</button></td>' +
          '<td class="num">' + (r.moyenneGenerale != null ? UI.dec(r.moyenneGenerale) : '–') + '</td>' +
          '<td>' + (r.mention ? '<span class="badge ' + mentionClass(r.mention) + '">' + UI.esc(r.mention) + '</span>' : '–') + '</td>' +
          '<td class="num">' + (r.sommeCoefVal != null ? UI.dec(r.sommeCoefVal, 1) : '–') + '</td>' +
          '<td class="num">' + (r.sommeCoef || '–') + '</td>' +
          '</tr>';
      }).join('');
      body.innerHTML = '<div class="card-title" style="margin-bottom:10px">Résultats — ' + UI.esc((await DB.getAll('classes')).find(c => c.id === selClasse).libelle) + '</div>' +
        UI.table(['Rang', 'Élève', '', 'Moyenne générale', 'Mention', 'Total coef.', 'Somme coef.'], rows || UI.empty(7)) +
        '<div class="bar" style="margin-top:14px;display:flex;gap:10px;align-items:center">' +
        '<b>Imprimer tous les bulletins de cette classe en une seule fois :</b>' +
        '<button class="btn btn-ok" id="bl-print2">🖨 Imprimer la classe</button></div>';
      body.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => {
        const r = ranked.find(x => x.eleve.id === Number(b.dataset.view));
        const premier = ranked.find(x => x.rank === 1);
        showBulletinModal(r, premier && premier.moyenneGenerale != null ? premier.moyenneGenerale : null);
      });
      const p2 = body.querySelector('#bl-print2');
      if (p2) p2.onclick = printClass;
    }

    function mentionClass(m) {
      if (m === 'Très bien') return 'badge-ok';
      if (m === 'Bien') return 'badge-primary';
      if (m === 'Assez bien') return 'badge-info';
      if (m === 'Passable') return 'badge-warn';
      return 'badge-danger';
    }

    function bulletinHtml(r, cl, trim, eco, opts) {
      opts = opts || {};
      const signTitre = ({
          fondamental: 'Le Directeur',
          lycee: 'Le Proviseur',
          superieur: 'Le Doyen / Secrétaire Général'
        }[(eco && eco.type) || 'fondamental'] || 'Le Directeur');
      const ville = (eco && eco.adresse ? String(eco.adresse).split(',')[0].trim() : '');
      let rows = r.rows.map((x) => {
        return '<tr>' +
          '<td>' + UI.esc(x.matiere) + '</td>' +
          '<td class="num">' + (x.moyClasse != null ? UI.dec(x.moyClasse) : '–') + '</td>' +
          '<td class="num">' + (x.moyCompo != null ? UI.dec(x.moyCompo) : '–') + '</td>' +
          '<td class="num">' + (x.moyMatiere != null ? UI.dec(x.moyMatiere) : '–') + '</td>' +
          '<td class="num">' + x.coef + '</td>' +
          '<td class="num">' + (x.coefVal != null ? UI.dec(x.coefVal) : '–') + '</td>' +
          '<td>' + UI.esc(x.appreciation) + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="page-bulletin" style="width:210mm;margin:0 auto">' +
        UI.letterhead(eco, {
          title: 'BULLETIN DE NOTES',
          subtitle: { label: 'Trimestre', value: (trim ? trim.libelle : '') + ' · ' + (cl ? 'Classe ' + Data.classeLabel(cl) : '') }
        }, {}) +
        '<div class="bulletin-infos">' +
          '<div><b>Nom :</b> ' + UI.esc(Data.personneNom(r.eleve)) + '</div>' +
          '<div><b>Matricule :</b> ' + UI.esc(r.eleve.matricule || '–') + '</div>' +
          (r.eleve.dateNaissance ? '<div><b>Né(e) le :</b> ' + UI.dateFr(r.eleve.dateNaissance) + '</div>' : '') +
          '<div><b>Effectif noté :</b> ' + r.nbNotes + ' matières</div>' +
          (r.rank != null ? '<div><b>Rang dans la classe :</b> <strong>' + r.rank + 'e / ' + r.effectif + '</strong></div>' : '') +
        '</div>' +
        '<table class="tbl" style="font-size:12px">' +
        '<thead><tr><th>Matière</th><th>Moy. classe /20</th><th>Moy. comp. /40</th><th>Moy. matière</th><th>Coef.</th><th>Moy. × coef.</th><th>Appréciation</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td colspan="4"><b>MOYENNE GÉNÉRALE : ' + (r.moyenneGenerale != null ? UI.dec(r.moyenneGenerale) : '–') + ' / 20</b></td>' +
        '<td>' + (r.sommeCoef || '–') + '</td>' +
        '<td class="num">' + (r.sommeCoefVal != null ? UI.dec(r.sommeCoefVal, 1) : '–') + '</td>' +
        '<td><b>' + UI.esc(r.mention) + '</b></td></tr></tfoot></table>' +
        '<div class="bulletin-foot">' +
          '<div class="bulletin-sigs">' +
            '<div><b>Moyenne obtenue par le 1er/ère :</b> ' + (opts.premier != null ? UI.dec(opts.premier) + ' / 20' : '–') +
              '<br><b>Rang obtenu par l\'élève/étudiant :</b> ' + (r.rank != null ? r.rank + 'e / ' + r.effectif : '–') + '</div>' +
            '<div class="bulletin-sig"><div class="sig-line"></div>La signature du parent</div>' +
            '<div class="bulletin-sig">' + (ville ? '<div style="margin-bottom:8px"><i>Fait à ' + UI.esc(ville) + ', le ' + UI.dateFr(UI.today()) + '</i></div>' : '') +
              '<div class="sig-line"></div>' + signTitre +
              (eco && eco.directeur ? '<div style="margin-top:6px"><b>' + UI.esc(eco.directeur) + '</b></div>' : '') + '</div>' +
          '</div>' +
        '</div>' +
        '</div>';
    }

    async function showBulletinModal(r, premier) {
      const [cl, trim, eco, allTrims] = await Promise.all([DB.get('classes', selClasse), DB.get('trimestres', selTrim), DB.get('ecole', 1), DB.getAll('trimestres')]);
      const cl2 = await DB.get('classes', selClasse);
      const trim2 = trim || Data.trimById(allTrims, selTrim, cl && cl.anneeId);
      UI.modal(bulletinHtml(r, cl2, trim2, eco, { premier: premier }), '<button class="btn btn-ok" data-print>🖨 Imprimer</button><button class="btn btn-ghost" data-close>Fermer</button>', { title: 'Bulletin de ' + Data.personneNom(r.eleve), size: 'modal modal-lg modal-xl' });
      const mRoot = document.querySelector('.modal-overlay');
      mRoot.querySelector('[data-print]').onclick = () => UI.print(bulletinHtml(r, cl2, trim2, eco, { premier: premier }), 'Bulletin');
      mRoot.querySelector('[data-close]').onclick = () => UI.closeModal();
    }

    async function printClass() {
      if (!selClasse) { UI.toast('Choisissez une classe.', 'err'); return; }
      const eleves = await elevesDeClasse();
      if (!eleves.length) { UI.toast('Aucun élève dans cette classe.', 'err'); return; }
      const [cl, trim, eco, allTrims] = await Promise.all([DB.get('classes', selClasse), DB.get('trimestres', selTrim), DB.get('ecole', 1), DB.getAll('trimestres')]);
      const trim2 = trim || Data.trimById(allTrims, selTrim, cl && cl.anneeId);
      const computed = [];
      for (const ev of eleves) computed.push(await Bulletins.computeStudent(ev, selClasse, selTrim));
      const ranked = Bulletins.rank(computed);
      const premier = ranked.find(x => x.rank === 1);
      let all = '';
      for (const r of ranked) all += bulletinHtml(r, cl, trim2, eco, { premier: premier && premier.moyenneGenerale != null ? premier.moyenneGenerale : null });
      UI.print(all, 'Bulletins - ' + (cl ? cl.libelle : ''));
    }

    async function renderMyBulletin() {
      const me = (await DB.getAll('eleves')).find(el => el.userId === u.id);
      if (!me || !me.classeId) { body.innerHTML = '<div class="notice-warn notice">Aucune fiche élève reliée à votre compte ou aucune classe.</div>'; return; }
      const trims = await DB.getAll('trimestres');
      const effTrims = Data.effectiveTrimestres(trims);
      filters.innerHTML = '<div class="field"><label>Trimestre</label><select id="bl-trim">' + UI.options(effTrims.map(t => ({ id: t.id, libelle: t.libelle })), effTrims[0] ? effTrims[0].id : '', 'Choisir…') + '</select></div>' +
        '<button class="btn btn-outline" id="bl-view" style="align-self:end">Afficher</button>';
      const view = async () => {
        const trimId = Number(filters.querySelector('#bl-trim').value);
        if (!trimId) { body.innerHTML = '<div class="notice">Choisissez un trimestre.</div>'; return; }
        const ranked = await Bulletins.classResults(me.classeId, trimId);
        const r = ranked.find(x => x.eleve.id === me.id);
        if (!r) { body.innerHTML = '<div class="notice">Aucun résultat.</div>'; return; }
        const premier = ranked.find(x => x.rank === 1);
        const [cl, trim, eco] = await Promise.all([DB.get('classes', me.classeId), DB.get('trimestres', trimId), DB.get('ecole', 1)]);
        const trim2 = trim || Data.trimById(trims, trimId, cl && cl.anneeId);
        const opts2 = { premier: premier && premier.moyenneGenerale != null ? premier.moyenneGenerale : null };
        body.innerHTML = '<div class="card-title" style="margin-bottom:10px">Mes résultats</div>' + bulletinHtml(r, cl, trim2, eco, opts2) +
          '<div style="margin-top:14px"><button class="btn btn-ok" id="my-print">🖨 Imprimer</button></div>';
        body.querySelector('#my-print').onclick = () => UI.print(bulletinHtml(r, cl, trim2, eco, opts2), 'Mon bulletin');
      };
      filters.querySelector('#bl-view').onclick = view;
      view();
    }
  }
});
