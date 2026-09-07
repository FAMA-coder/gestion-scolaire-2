/* ============================================================
   passages.js — Gestion des passages : promotion / changement de classe
   ============================================================ */
App.register('passages', {
  title: 'Passages & Promotion',
  navLabel: 'Passages',
  icon: 'P',
  group: 'Scolarité',
  perm: 'passages.manage',
  render: async function (root) {
    const d = await Data.common();
    const classes = d.classes;
    const annee = await DB.get('ecole', 1);
    let anneeId = annee && annee.anneeEnCoursId || null;
    const annees = await DB.getAll('annees');

    root.innerHTML =
      '<div class="bar"><div class="bar-head"><div class="card-title">Passages & promotion des élèves</div>' +
      '<p class="card-sub" style="margin-top:6px">Déplacez des élèves d\'une classe vers une autre (fin d\'année, redoublement, changement de section). Chaque passage est enregistré dans l\'historique.</p></div>' +
      '<div class="filter-bar" id="pg-filters"></div></div>' +
      '<div class="bar" id="pg-body"></div>' +
      '<div class="bar"><div class="card-title">Historique des passages</div><div class="table-wrap" id="pg-history"></div></div>';

    const filters = root.querySelector('#pg-filters');
    const body = root.querySelector('#pg-body');

    let selFrom = ctxFromDefault();
    let selTo = classes.length > 1 ? classes.find(c => c.id !== selFrom) : null;
    selTo = selTo ? selTo.id : null;

    function ctxFromDefault() {
      // classe du niveau le plus « bas » (ordre de création) par défaut
      return classes.length ? classes[0].id : null;
    }

    function renderFilters() {
      filters.innerHTML =
        '<div class="field"><label>De la classe</label><select id="pg-from">' + UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), selFrom, 'Choisir…') + '</select></div>' +
        '<div class="field"><label>Vers la classe</label><select id="pg-to">' + UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), selTo, 'Choisir…') + '</select></div>' +
        '<div class="field"><label>Année scolaire</label><select id="pg-annee">' + UI.options(annees.map(a => ({ id: a.id, libelle: a.libelle })), anneeId, '—') + '</select></div>' +
        '<button class="btn btn-ok" id="pg-go" style="align-self:end">Lister les élèves →</button>';
      filters.querySelector('#pg-from').onchange = (e) => { selFrom = Number(e.target.value); };
      filters.querySelector('#pg-to').onchange = (e) => { selTo = Number(e.target.value); };
      filters.querySelector('#pg-annee').onchange = (e) => { anneeId = Number(e.target.value) || null; };
      filters.querySelector('#pg-go').onclick = renderBody;
    }

    async function renderBody() {
      if (!selFrom || !selTo) { body.innerHTML = '<div class="notice">Choisissez la classe d\'origine et la classe de destination.</div>'; return; }
      if (selFrom === selTo) { body.innerHTML = '<div class="notice-warn notice">La classe d\'origine et la classe de destination sont identiques.</div>'; return; }
      const eleves = (await DB.getAll('eleves')).filter(e => e.classeId === selFrom).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
      if (!eleves.length) { body.innerHTML = '<div class="empty">Aucun élève dans la classe d\'origine.</div>'; return; }
      const rows = eleves.map((e) =>
        '<tr><td><input type="checkbox" class="pg-check" data-id="' + e.id + '"></td>' +
        '<td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
        '<td>' + UI.esc(e.matricule || '–') + '</td>' +
        '<td>' + (e.sexe === 'M' ? 'M' : e.sexe === 'F' ? 'F' : '–') + '</td>' +
        '</tr>').join('');
      body.innerHTML =
        '<div class="filter-bar" style="margin-bottom:10px"><b>' + eleves.length + ' élève(s)</b>' +
        '<button class="btn btn-sm btn-outline" id="pg-all">Tout sélectionner</button>' +
        '<button class="btn btn-sm btn-ghost" id="pg-none">Tout désélectionner</button></div>' +
        UI.table(['', 'Élève', 'Matricule', 'Sexe'], rows || UI.empty(4)) +
        '<div class="filter-bar" style="margin-top:12px"><button class="btn btn-ok" id="pg-promote">Promouvoir les sélectionnés</button>' +
        '<span class="hint">Le passage met à jour la classe des élèves et enregistre chaque mouvement dans l\'historique.</span></div>';
      const fromCl = classes.find(c => c.id === selFrom), toCl = classes.find(c => c.id === selTo);
      body.querySelector('#pg-all').onclick = () => body.querySelectorAll('.pg-check').forEach(c => c.checked = true);
      body.querySelector('#pg-none').onclick = () => body.querySelectorAll('.pg-check').forEach(c => c.checked = false);
      body.querySelector('#pg-promote').onclick = () => confirmPromote(eleves, fromCl, toCl);
    }

    function confirmPromote(eleves, fromCl, toCl) {
      const selected = eleves.filter(e => {
        const cb = body.querySelector('.pg-check[data-id="' + e.id + '"]');
        return cb && cb.checked;
      });
      if (!selected.length) { UI.toast('Aucun élève sélectionné.', 'err'); return; }
      UI.confirm('Promouvoir ' + selected.length + ' élève(s) de « ' + Data.classeLabel(fromCl) + ' » vers « ' + Data.classeLabel(toCl) + ' » ?', async () => {
        for (const ev of selected) {
          ev.classeId = selTo;
          ev.datePassage = UI.nowIso();
          await DB.put('eleves', ev);
          await DB.add('passages', { eleveId: ev.id, deClasseId: selFrom, versClasseId: selTo, anneeId: anneeId, dateCreation: UI.nowIso() });
        }
        UI.toast(selected.length + ' élève(s) promu(s).', 'ok');
        renderBody();
        renderHistory();
      }, { title: 'Passage de classe' });
    }

    async function renderHistory() {
      const passages = await DB.getAll('passages');
      const eleves = await DB.getAll('eleves');
      const rows = passages.slice().sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || '')).reverse().map((p) => {
        const ev = eleves.find(x => x.id === p.eleveId);
        const dc = classes.find(c => c.id === p.deClasseId);
        const vc = classes.find(c => c.id === p.versClasseId);
        return '<tr><td><strong>' + UI.esc(ev ? Data.personneNom(ev) : '?') + '</strong></td>' +
          '<td>' + UI.esc(dc ? Data.classeLabel(dc) : '–') + '</td>' +
          '<td>→</td>' +
          '<td>' + UI.esc(vc ? Data.classeLabel(vc) : '–') + '</td>' +
          '<td>' + (p.dateCreation ? UI.dateFr(p.dateCreation.slice(0, 10)) : '–') + '</td></tr>';
      }).join('');
      const histEl = root.querySelector('#pg-history');
      histEl.innerHTML = UI.table(['Élève', 'De', '', 'Vers', 'Date'], rows || UI.empty(5));
    }

    renderFilters();
    renderHistory();
  }
});
