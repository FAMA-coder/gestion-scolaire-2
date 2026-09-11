/* ============================================================
   cartes.js — Cartes scolaire : génération & impression
   avec photo de l'élève/étudiant + identité de l'école (logo).
   ============================================================ */

function carteHtml(e, ctx) {
  const school = ctx.school || {};
  const cl = ctx.classes.find((c) => c.id === e.classeId);
  const nv = cl ? ctx.niveaux.find((n) => n.id === cl.niveauId) : null;
  const nom = Data.personneNom(e);
  const classeLabel = cl ? Data.classeLabel(cl) : 'Non affecté';
  const niveau = nv ? (nv.libelle || '') : '';
  const sexeLib = e.sexe === 'M' ? 'Masculin' : e.sexe === 'F' ? 'Féminin' : '—';
  const photo = e.photo
    ? '<img src="' + UI.esc(e.photo) + '" alt="photo">'
    : '<div class="carte-photo-init">' + UI.esc(UI.avatar(e.nom, e.prenom)) + '</div>';
  const annee = ctx.annee ? '<b>' + UI.esc(ctx.annee) + '</b>' : '—';
  const logo = school.logo
    ? '<img src="' + UI.esc(school.logo) + '" alt="logo">'
    : '<b>' + UI.esc(((school.nom || 'GS')[0] || 'GS').toUpperCase()) + '</b>';
  const identity = [school.adresse, school.tel ? 'Tél : ' + school.tel : '', school.email].filter(Boolean).join(' · ');

  return '<div class="carte">' +
    '<div class="carte-head">' +
      '<div class="carte-logo">' + logo + '</div>' +
      '<div class="carte-school">' +
        '<div class="carte-school-name">' + UI.esc(school.nom || 'Établissement') + '</div>' +
        (school.slogan ? '<div class="carte-school-sub">' + UI.esc(school.slogan) + '</div>' : '') +
        (identity ? '<div class="carte-school-id">' + UI.esc(identity) + '</div>' : '') +
      '</div>' +
      '<div class="carte-type">CARTE SCOLAIRE</div>' +
    '</div>' +
    '<div class="carte-body">' +
      '<div class="carte-photo">' + photo + '</div>' +
      '<div class="carte-info">' +
        '<div class="carte-nom">' + UI.esc(nom.toUpperCase()) + '</div>' +
        '<div class="carte-table">' +
          '<div class="carte-row"><span class="carte-k">Matricule</span><span class="carte-v">' + UI.esc(e.matricule || '—') + '</span></div>' +
          '<div class="carte-row"><span class="carte-k">Classe</span><span class="carte-v">' + UI.esc(classeLabel) + (niveau ? ' · ' + UI.esc(niveau) : '') + '</span></div>' +
          '<div class="carte-row"><span class="carte-k">Sexe</span><span class="carte-v">' + UI.esc(sexeLib) + '</span></div>' +
          '<div class="carte-row"><span class="carte-k">Naissance</span><span class="carte-v">' + (e.dateNaissance ? UI.dateFr(e.dateNaissance) : '—') + (e.lieuNaissance ? ' à ' + UI.esc(e.lieuNaissance) : '') + '</span></div>' +
          (e.tuteur ? '<div class="carte-row"><span class="carte-k">Tuteur</span><span class="carte-v">' + UI.esc(e.tuteur) + '</span></div>' : '') +
          (e.telTuteur ? '<div class="carte-row"><span class="carte-k">Tél.</span><span class="carte-v">' + UI.esc(e.telTuteur) + '</span></div>' : '') +
          '<div class="carte-row"><span class="carte-k">Année</span><span class="carte-v">' + annee + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="carte-foot">' +
      (school.directeur ? '<span class="carte-foot-item"><span class="carte-foot-line"></span>' + UI.esc('Le Directeur · ' + school.directeur) + '</span>' : '') +
      '<span class="carte-foot-item"><span class="carte-foot-line"></span>Signature</span>' +
    '</div>' +
  '</div>';
}

App.register('cartes', {
  title: 'Cartes scolaires',
  navLabel: 'Cartes scolaires',
  icon: 'C',
  group: 'Scolarité',
  perm: 'cartes.manage',
  render: async function (root) {
    root.innerHTML = `
      <div class="bar"><div class="bar-head"><div class="card-title">Cartes scolaires</div>
        <div class="toolbar">
          <select id="ct-filter" style="width:auto"><option value="">Classe</option></select>
          <button class="btn btn-outline" id="ct-print">Imprimer les cartes</button>
        </div></div>
      <div class="table-wrap" id="ct-list"></div></div>`;
    const filterEl = root.querySelector('#ct-filter');
    const listEl = root.querySelector('#ct-list');
    const data = await Data.common();
    const school = await DB.get('ecole', 1);
    const anneeObj = (data.annees || []).find((a) => a.id === (school && school.anneeEnCoursId));
    loadFilter();
    renderList();
    filterEl.onchange = renderList;
    function loadFilter() {
      filterEl.innerHTML = UI.options(data.classes.map((c) => ({ id: c.id, libelle: Data.classeLabel(c) })), '', 'Toutes les classes');
    }
    function selected() {
      return data.eleves
        .filter((e) => e.actif !== false && (!filterEl.value || e.classeId === Number(filterEl.value)))
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    }
    function renderList() {
      const list = selected();
      const rows = list.map((e) => {
        const cl = data.classes.find((c) => c.id === e.classeId);
        const ph = e.photo
          ? '<img src="' + UI.esc(e.photo) + '" class="th-photo">'
          : '<span class="th-photo th-photo-init">' + UI.avatar(e.nom, e.prenom) + '</span>';
        return '<tr><td>' + ph + '</td><td><strong>' + UI.esc(Data.personneNom(e)) + '</strong></td>' +
          '<td>' + UI.esc(e.matricule || '–') + '</td>' +
          '<td><span class="badge badge-info">' + UI.esc(cl ? Data.classeLabel(cl) : 'Non affecté') + '</span></td>' +
          '<td>' + (e.photo ? '<span class="badge badge-ok">Photo</span>' : '<span class="badge badge-gray">Sans photo</span>') + '</td>' +
          '<td class="actions-cell"><button class="btn btn-sm btn-outline" data-card="' + e.id + '">Carte</button></td></tr>';
      }).join('');
      listEl.innerHTML = UI.table(['Photo', 'Nom', 'Matricule', 'Classe', 'Statut photo', 'Actions'], rows || UI.empty(6));
      listEl.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => previewCard(data.eleves.find((x) => x.id === Number(b.dataset.card))));
    }
    function ctx() {
      return { school: school || {}, classes: data.classes, niveaux: data.niveaux, annee: anneeObj ? anneeObj.libelle : '' };
    }
    function previewCard(e) {
      const m = UI.modal(carteHtml(e, ctx()), `
        <button class="btn btn-primary" data-print>Imprimer la carte</button>
      `, { title: 'Carte scolaire · ' + Data.personneNom(e), size: 'modal' });
      m.modal.querySelector('[data-print]').onclick = () => {
        UI.print(carteHtml(e, ctx()), 'Carte scolaire · ' + Data.personneNom(e));
      };
    }
    root.querySelector('#ct-print').onclick = () => {
      const list = selected();
      if (!list.length) { UI.toast('Aucun élève sélectionné.', 'err'); return; }
      UI.print(list.map((e) => carteHtml(e, ctx())).join(''), 'Cartes scolaires');
    };
  }
});