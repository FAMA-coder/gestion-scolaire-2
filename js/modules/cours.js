/* ============================================================
   cours.js — Volumes horaires, pointage des heures de cours et
   honoraires des enseignants sur une période définie.
   S'appuie sur : affectations (volumes + durées), enseignants
   (taux horaire), emploi du temps, salaires.
   ============================================================ */

const PO_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
// Bases de calcul du volume prévu d'une affectation sur une période.
const PO_BASES = [
  ['hebdo', 'Hebdomadaire'], ['mensuel', 'Mensuel'], ['trimestriel', 'Trimestriel'],
  ['semestriel', 'Semestriel'], ['annuel', 'Annuel']
];
const PO_UNIT_DAYS = { hebdo: 7, mensuel: 30.44, trimestriel: 91.31, semestriel: 182.62, annuel: 365.25 };
const PO_ORDER = ['hebdo', 'mensuel', 'trimestriel', 'semestriel', 'annuel'];
const PO_MOTIFS = ['', 'Absence enseignant', 'Absence du professeur', 'Grève', 'Jour férié', 'Activité scolaire', 'Rattrapage', 'Autre'];

// Nombre de jours inclus dans la période [from, to] (bornes incluses).
function poDays(from, to) {
  if (!from || !to) return 0;
  const a = new Date(from), b = new Date(to);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
// Heures prévues d'une affectation sur la période, selon la base choisie
// (repli sur la base suivante définie si celle-ci est absente).
function poPlanned(aff, from, to, base) {
  const days = poDays(from, to);
  if (!days || !aff || !aff.volumes) return 0;
  const v = aff.volumes;
  let key = base;
  if (!(v[key] != null && Number(v[key]) > 0)) {
    const next = PO_ORDER.find((k) => v[k] != null && Number(v[k]) > 0);
    if (!next) return 0;
    key = next;
  }
  const per = Number(v[key]) || 0;
  if (!(per > 0)) return 0;
  return Math.round(per * days / PO_UNIT_DAYS[key] * 100) / 100;
}
// Pointages compris dans la période (bornes incluses, ouvertes si vides).
function poRange(pts, from, to) {
  return (pts || []).filter((p) => {
    if (!p.date) return false;
    if (from && String(p.date) < String(from)) return false;
    if (to && String(p.date) > String(to)) return false;
    return true;
  });
}
function poSum(list, effectue) {
  return list.reduce((s, p) => s + (p.effectue === effectue ? (Number(p.duree) || 0) : 0), 0);
}
function poFmtH(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  return (v % 1 === 0 ? String(v) : String(v).replace('.', ','));
}
function poMonthRange(mois, annee) {
  const from = annee + '-' + String(mois).padStart(2, '0') + '-01';
  const last = new Date(annee, mois, 0).getDate();
  const to = annee + '-' + String(mois).padStart(2, '0') + '-' + String(last).padStart(2, '0');
  return { from, to };
}
// Badge récapitulatif des volumes définis d'une affectation.
function poVolBadges(volumes) {
  if (!volumes) return '<span class="badge badge-gray">—</span>';
  const labels = [['hebdo', 'sem'], ['mensuel', 'mois'], ['trimestriel', 'trim'], ['semestriel', 'sem'], ['annuel', 'an']];
  const parts = labels.filter(([k]) => volumes[k] != null && Number(volumes[k]) > 0)
    .map(([k, lab]) => '<span class="badge badge-info" title="' + k + '">' + poFmtH(volumes[k]) + ' h/' + lab + '</span>');
  return parts.length ? parts.join(' ') : '<span class="badge badge-gray">—</span>';
}
// Badge des durées de cours définies.
function poDureesBadges(durees) {
  if (!(durees && durees.length)) return '<span class="badge badge-gray">—</span>';
  return durees.filter((d) => Number(d) > 0).map((d) => '<span class="badge badge-gray">' + poFmtH(d) + ' h</span>').join(' ');
}
// Pointages d'une affectation (lien enseignant/matière/classe) sur une période.
function poForAff(pts, aff, from, to) {
  return poRange(pts, from, to).filter((p) =>
    p.enseignantId === aff.enseignantId && p.matiereId === aff.matiereId && p.classeId === aff.classeId);
}

// ---- Contrôle & vérification des volumes horaires ----
const PO_CAPACITE_DEFAUT = 24; // charge hebdomadaire normale par défaut d'un enseignant
const PO_EPS = 0.01;           // tolérance arrondi pour considérer deux volumes égaux

// Volume hebdomadaire octroyé à une affectation (repli sur les autres bases).
function poOctroyeHebdo(a) {
  const v = (a && a.volumes) ? a.volumes : {};
  if (v.hebdo != null && Number(v.hebdo) > 0) return Number(v.hebdo);
  if (v.mensuel != null && Number(v.mensuel) > 0) return Number(v.mensuel) / 4.33;
  if (v.trimestriel != null && Number(v.trimestriel) > 0) return Number(v.trimestriel) / 13;
  if (v.semestriel != null && Number(v.semestriel) > 0) return Number(v.semestriel) / 26;
  if (v.annuel != null && Number(v.annuel) > 0) return Number(v.annuel) / 52;
  return 0;
}
// Heures hebdomadaires programmées à l'emploi du temps pour une affectation (e, m, c).
function poProgrammeHebdo(emplois, ensId, matId, clId) {
  return (emplois || []).filter((x) => x.enseignantId === ensId && x.matiereId === matId && x.classeId === clId)
    .reduce((s, x) => s + (Number(x.duree) || 1), 0);
}
// Nombre d'occurrences d'un jour (0=Lundi..5=Samedi) entre deux dates incluses.
function poOccurrences(jour, from, to) {
  if (!from || !to) return 0;
  const d = new Date(from);
  const end = new Date(to);
  let n = 0;
  while (d <= end) {
    if (d.getDay() === ((Number(jour) + 1) % 7)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
// Heures programmées (emploi du temps) d'un enseignant sur une période.
function poProgrammePeriode(emplois, ensId, from, to) {
  return (emplois || []).filter((x) => x.enseignantId === ensId)
    .reduce((s, x) => s + poOccurrences(x.jour, from, to) * (Number(x.duree) || 1), 0);
}
// Badge de conformité d'un écart.
function poBadgeEc(nomEc) {
  const v = Number(nomEc) || 0;
  if (Math.abs(v) <= PO_EPS) return '<span class="badge badge-ok">Conforme</span>';
  if (v > 0) return '<span class="badge badge-danger">Excédent (+' + poFmtH(v) + ' h)</span>';
  return '<span class="badge badge-warn">Déficit (' + poFmtH(v) + ' h)</span>';
}
function poBadgeChg(nomEc) {
  const v = Number(nomEc) || 0;
  if (Math.abs(v) <= PO_EPS) return '<span class="badge badge-ok">Conforme</span>';
  if (v > 0) return '<span class="badge badge-warn">Sous-programmé (−' + poFmtH(Math.abs(v)) + ' h)</span>';
  return '<span class="badge badge-danger">Surchargé (+' + poFmtH(Math.abs(v)) + ' h)</span>';
}
// Badge de charge d'un enseignant (pct = charge/capacité*100).
function poBadgeCap(pct) {
  if (pct > 100) return '<span class="badge badge-danger">Surcharge</span>';
  if (pct >= 80) return '<span class="badge badge-ok">Conforme</span>';
  return '<span class="badge badge-warn">Sous chargé</span>';
}

/* ============================================================
   VOLUMES HORAIRES — définition & suivi par matière / classe
   ============================================================ */
App.register('volumes', {
  title: 'Volumes horaires',
  navLabel: 'Volumes horaires',
  icon: 'V',
  group: 'Pédagogie',
  perm: 'volumes.manage',
  render: async function (root) {
    const now = new Date();
    const defFrom = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
    root.innerHTML =
      '<div class="bar"><div class="card-title">Volumes horaires — suivi par matière et par classe</div>' +
      '<div class="toolbar" id="vo-tools"></div></div>' +
      '<div class="grid" id="vo-cards" style="margin-bottom:16px"></div>' +
      '<div class="bar"><div class="table-wrap" id="vo-list"></div></div>';
    const tools = root.querySelector('#vo-tools');
    const cardsEl = root.querySelector('#vo-cards');
    const listEl = root.querySelector('#vo-list');
    const classes = await DB.getAll('classes');
    tools.innerHTML =
      '<label>Classe</label><select id="vo-cl" style="width:auto">' +
        UI.options(classes.map((c) => ({ id: c.id, libelle: Data.classeLabel(c) })), '', 'Toutes les classes') + '</select>' +
      '<label>De</label><input type="date" id="vo-from" value="' + defFrom + '">' +
      '<label>À</label><input type="date" id="vo-to" value="' + UI.today() + '">' +
      '<label>Base</label><select id="vo-base" style="width:auto">' +
        UI.options(PO_BASES.map(([id, lb]) => ({ id: id, libelle: lb })), 'mensuel', null) + '</select>' +
      '<button class="btn btn-outline" id="vo-aff">Affectations</button>';
    tools.querySelector('#vo-aff').onclick = () => App.go('affectations');
    ['vo-cl', 'vo-from', 'vo-to', 'vo-base'].forEach((id) => {
      tools.querySelector('#' + id).addEventListener('change', render);
    });
    render();

    async function render() {
      const { affectations, enseignants, matieres, classes: clList } = await Data.common();
      const pointages = await DB.getAll('pointages') || [];
      const clId = Number(tools.querySelector('#vo-cl').value) || null;
      const from = tools.querySelector('#vo-from').value;
      const to = tools.querySelector('#vo-to').value;
      const base = tools.querySelector('#vo-base').value || 'mensuel';
      const affs = affectations.filter((a) => !clId || a.classeId === clId);
      if (!affs.length) {
        cardsEl.innerHTML = '';
        listEl.innerHTML = '<div class="notice">Aucune affectation' + (clId ? ' pour cette classe' : '') + '. Définissez d\'abord les affectations (Pédagogie → Affectations).</div>';
        return;
      }
      let sumPrev = 0, sumEff = 0, sumNon = 0, sumRest = 0, rowsCount = 0;
      const rows = affs.map((a) => {
        const en = enseignants.find((x) => x.id === a.enseignantId);
        const ma = matieres.find((x) => x.id === a.matiereId);
        const cl = clList.find((x) => x.id === a.classeId);
        const prev = poPlanned(a, from, to, base);
        const eps = poForAff(pointages, a, from, to);
        const eff = poSum(eps, true);
        const non = poSum(eps, false);
        const rest = Math.max(0, Math.round((prev - eff) * 100) / 100);
        sumPrev += prev; sumEff += eff; sumNon += non; sumRest += rest; rowsCount++;
        const pct = prev > 0 ? Math.round(eff / prev * 100) : (eff > 0 ? 100 : 0);
        const statut = prev <= 0 ? '<span class="badge badge-gray">—</span>'
          : (eff >= prev ? '<span class="badge badge-ok">OK</span>' : '<span class="badge badge-warn">En retard</span>');
        return '<tr>' +
          '<td>' + (cl ? UI.esc(Data.classeLabel(cl)) : '—') + '</td>' +
          '<td><strong>' + UI.esc(ma ? ma.libelle : '—') + '</strong></td>' +
          '<td>' + UI.esc(en ? Data.personneNom(en) : '—') + '</td>' +
          '<td class="num">' + (a.coefficient || (ma ? (ma.coefficient || 1) : '')) + '</td>' +
          '<td>' + poVolBadges(a.volumes) + '</td>' +
          '<td>' + poDureesBadges(a.durees) + '</td>' +
          '<td class="num"><b>' + poFmtH(prev) + '</b> h</td>' +
          '<td class="num">' + poFmtH(eff) + ' h</td>' +
          '<td class="num">' + poFmtH(non) + ' h</td>' +
          '<td class="num">' + poFmtH(rest) + ' h</td>' +
          '<td class="num">' + pct + ' %</td>' +
          '<td>' + statut + '</td>' +
        '</tr>';
      }).join('');
      const pctTot = sumPrev > 0 ? Math.round(sumEff / sumPrev * 100) : (sumEff > 0 ? 100 : 0);
      cardsEl.innerHTML =
        '<div class="stat-card"><div class="stat-icon" style="background:#2563eb">A</div>' +
        '<div class="stat-label">Affectations suivies</div><div class="stat-value">' + rowsCount + '</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#0891b2">P</div>' +
        '<div class="stat-label">Heures prévues</div><div class="stat-value">' + poFmtH(sumPrev) + ' h</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#16a34a">✓</div>' +
        '<div class="stat-label">Heures effectuées</div><div class="stat-value">' + poFmtH(sumEff) + ' h</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#dc2626">✗</div>' +
        '<div class="stat-label">Réalisation</div><div class="stat-value">' + pctTot + ' %</div></div>';
      listEl.innerHTML = UI.table(
        ['Classe', 'Matière', 'Enseignant', 'Coef.', 'Volumes définis', 'Durées (h)', 'Prévu', 'Effectué', 'Non effectué', 'Restant', 'Rythme', 'Statut'],
        rows + '<tr style="font-weight:700;background:var(--gray-100)">' +
          '<td>Totaux</td><td colspan="5"></td>' +
          '<td class="num">' + poFmtH(sumPrev) + ' h</td>' +
          '<td class="num">' + poFmtH(sumEff) + ' h</td>' +
          '<td class="num">' + poFmtH(sumNon) + ' h</td>' +
          '<td class="num">' + poFmtH(sumRest) + ' h</td>' +
          '<td class="num">' + pctTot + ' %</td><td></td></tr>'
      );
    }
  }
});

/* ============================================================
   POINTAGE DES HEURES DE COURS — effectuées / non effectuées
   ============================================================ */
App.register('pointage', {
  title: 'Pointage des cours',
  navLabel: 'Pointage',
  icon: '✓',
  group: 'Pédagogie',
  perm: 'pointage.manage',
  render: async function (root) {
    const today = UI.today();
    root.innerHTML =
      '<div class="bar"><div class="card-title">Pointage des heures de cours</div>' +
      '<div class="toolbar" id="po-tools"></div></div>' +
      '<div class="bar" id="po-quick"></div>' +
      '<div class="bar"><div class="bar-head"><div class="card-title">Historique du pointage</div>' +
      '<div class="toolbar" id="po-hfilters"></div></div>' +
      '<div class="table-wrap" id="po-list"></div></div>';
    const tools = root.querySelector('#po-tools');
    const quickEl = root.querySelector('#po-quick');
    const histEl = root.querySelector('#po-list');
    const filtersEl = root.querySelector('#po-hfilters');
    const enseignants = await DB.getAll('enseignants');
    const affsAll = await DB.getAll('affectations');
    const ensWithAff = enseignants.filter((e) => affsAll.some((a) => a.enseignantId === e.id));
    tools.innerHTML =
      '<label>Enseignant</label><select id="po-ens" style="width:220px">' +
        UI.options(ensWithAff.map((e) => ({ id: e.id, libelle: Data.personneNom(e) })), '', 'Choisir…') + '</select>' +
      '<label>Date</label><input type="date" id="po-date" value="' + today + '">' +
      '<button class="btn btn-outline" id="po-print" title="Imprimer le pointage du mois">🖨 Imprimer</button>';
    const ensSel = tools.querySelector('#po-ens');
    const dateSel = tools.querySelector('#po-date');
    const now = new Date();
    filtersEl.innerHTML =
      '<label>Mois</label><select id="po-mois" style="width:auto">' +
        PO_MOIS.map((m, i) => '<option value="' + (i + 1) + '"' + (now.getMonth() === i ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>' +
      '<label>Année</label><input id="po-annee" type="number" min="2000" value="' + now.getFullYear() + '" style="width:100px">';
    const moisSel = filtersEl.querySelector('#po-mois');
    const anneeSel = filtersEl.querySelector('#po-annee');

    const renders = async () => { await renderQuick(); await renderHist(); };
    ensSel.onchange = renders;
    dateSel.onchange = renders;
    dateSel.oninput = renders;
    moisSel.onchange = renderHist;
    anneeSel.onchange = renderHist;
    anneeSel.oninput = renderHist;
    tools.querySelector('#po-print').onclick = printFiche;
    renders();

    // --- Pointage rapide : une ligne par affectation de l'enseignant, pour la date choisie ---
    async function renderQuick() {
      const ensId = Number(ensSel.value);
      const date = dateSel.value;
      if (!ensId) { quickEl.innerHTML = '<div class="notice">Choisissez un enseignant pour pointer ses heures de cours.</div>'; return; }
      if (!date) { quickEl.innerHTML = '<div class="notice">Choisissez une date.</div>'; return; }
      const { affectations, enseignants: ensList, matieres, classes } = await Data.common();
      const pointages = await DB.getAll('pointages') || [];
      const affs = affectations.filter((a) => a.enseignantId === ensId);
      const en = ensList.find((e) => e.id === ensId);
      if (!affs.length) { quickEl.innerHTML = '<div class="notice">Cet enseignant n\'a aucune affectation (classe/matière).</div>'; return; }
      let html = '<div class="card-sub" style="margin-bottom:8px">Pointage du <b>' + UI.dateFr(date) + '</b> — <b>' + UI.esc(Data.personneNom(en)) + '</b>' +
        (Number(en && en.tauxHoraire) > 0 ? ' · Taux : <b>' + UI.money(en.tauxHoraire) + '/h</b>' : ' · <span class="badge badge-warn">Taux horaire non défini</span>') + '</div>' +
        '<table class="tbl"><thead><tr><th>Classe</th><th>Matière</th><th>Durée (h)</th><th>Motif (si non effectué)</th><th>Action</th></tr></thead><tbody>';
      affs.forEach((a) => {
        const ma = matieres.find((m) => m.id === a.matiereId);
        const cl = classes.find((c) => c.id === a.classeId);
        const dur = (a.durees && a.durees.length ? a.durees.slice().sort((x, y) => x - y)[0] : 1);
        const ex = pointages.find((p) => p.enseignantId === a.enseignantId && p.matiereId === a.matiereId && p.classeId === a.classeId && p.date === date);
        const exBadge = ex
          ? (ex.effectue
              ? '<span class="badge badge-ok">Déjà effectué</span>'
              : '<span class="badge badge-danger">Déjà non effectué' + (ex.motif ? ' — ' + UI.esc(ex.motif) : '') + '</span>')
          : '';
        html += '<tr>' +
          '<td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td>' +
          '<td><strong>' + UI.esc(ma ? ma.libelle : '—') + '</strong></td>' +
          '<td><input type="number" min="0.25" step="0.25" value="' + dur + '" data-dur="' + a.id + '" style="width:90px"></td>' +
          '<td><input type="text" list="po-mt" data-mot="' + a.id + '" style="width:190px" value="' + (ex && ex.motif ? UI.esc(ex.motif) : '') + '" placeholder="Optionnel"></td>' +
          '<td>' + exBadge +
            '<button class="btn btn-sm btn-primary" data-ok="' + a.id + '">✓ Effectué</button> ' +
            '<button class="btn btn-sm btn-danger" data-no="' + a.id + '">✗ Non effectué</button>' +
          '</td></tr>';
      });
      html += '</tbody></table><datalist id="po-mt">' + PO_MOTIFS.filter(Boolean).map((m) => '<option value="' + UI.esc(m) + '">').join('') + '</datalist>';
      quickEl.innerHTML = html;
      const setPoint = (affId, effectue) => {
        const a = affs.find((x) => x.id === affId);
        if (!a) return;
        const dureeEl = quickEl.querySelector('[data-dur="' + affId + '"]');
        const duree = Math.max(0.25, Number(dureeEl && dureeEl.value) || 1);
        const motifEl = quickEl.querySelector('[data-mot="' + affId + '"]');
        const motif = (motifEl && effectue === false) ? motifEl.value.trim() : '';
        savePointage(a, date, duree, effectue, motif);
      };
      quickEl.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => setPoint(Number(b.dataset.ok), true));
      quickEl.querySelectorAll('[data-no]').forEach((b) => b.onclick = () => setPoint(Number(b.dataset.no), false));
    }

    // --- Enregistrement / mise à jour du pointage d'une affectation à une date ---
    async function savePointage(aff, date, duree, effectue, motif) {
      const all = await DB.getAll('pointages') || [];
      const ex = all.find((p) => p.enseignantId === aff.enseignantId && p.matiereId === aff.matiereId && p.classeId === aff.classeId && p.date === date);
      if (ex) {
        ex.duree = duree; ex.effectue = effectue; ex.motif = motif || ex.motif || '';
        await DB.put('pointages', ex);
        UI.toast('Pointage mis à jour (' + (effectue ? 'effectué' : 'non effectué') + ').', 'ok');
      } else {
        await DB.add('pointages', {
          enseignantId: aff.enseignantId, matiereId: aff.matiereId, classeId: aff.classeId,
          date: date, duree: duree, effectue: effectue, motif: motif || '',
          dateCreation: UI.nowIso()
        });
        UI.toast('Pointage enregistré.', 'ok');
      }
      await renderQuick(); await renderHist();
    }

    // --- Historique filtré par mois + édition ---
    async function renderHist() {
      const { affectations, enseignants: ensList, matieres, classes } = await Data.common();
      const pointages = await DB.getAll('pointages') || [];
      const mois = Number(moisSel.value) || (now.getMonth() + 1);
      const annee = Number(anneeSel.value) || now.getFullYear();
      const rng = poMonthRange(mois, annee);
      const inMonth = poRange(pointages, rng.from, rng.to);
      const sorts = inMonth.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const hEff = poSum(inMonth, true);
      const hNon = poSum(inMonth, false);
      const rows = sorts.map((p) => {
        const en = ensList.find((e) => e.id === p.enseignantId);
        const ma = matieres.find((m) => m.id === p.matiereId);
        const cl = classes.find((c) => c.id === p.classeId);
        return '<tr>' +
          '<td>' + UI.dateFr(p.date) + '</td>' +
          '<td><strong>' + UI.esc(en ? Data.personneNom(en) : '—') + '</strong></td>' +
          '<td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td>' +
          '<td>' + UI.esc(ma ? ma.libelle : '—') + '</td>' +
          '<td class="num">' + poFmtH(p.duree) + ' h</td>' +
          '<td>' + (p.effectue ? '<span class="badge badge-ok">Effectué</span>' : '<span class="badge badge-danger">Non effectué</span>') + '</td>' +
          '<td>' + UI.esc(p.motif || '–') + '</td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-edit="' + p.id + '">Modifier</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + p.id + '">Suppr.</button>' +
          '</td></tr>';
      }).join('');
      histEl.innerHTML =
        '<div class="card-sub" style="margin-bottom:10px">' +
          '<b>' + PO_MOIS[mois - 1] + ' ' + annee + '</b> — ' + sorts.length + ' séance(s) pointée(s) · ' +
          '<span class="badge badge-ok">' + poFmtH(hEff) + ' h effectuées</span> ' +
          '<span class="badge badge-danger">' + poFmtH(hNon) + ' h non effectuées</span>' +
        '</div>' +
        (rows ? UI.table(['Date', 'Enseignant', 'Classe', 'Matière', 'Durée', 'Statut', 'Motif', 'Actions'], rows)
              : '<div class="empty">Aucun pointage ce mois-ci.</div>');
      histEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        const p = pointages.find((x) => x.id === Number(b.dataset.del));
        UI.confirm('Supprimer ce pointage ?', async () => { await DB.del('pointages', p.id); await renderHist(); }, { title: 'Supprimer' });
      });
      histEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editPointage(pointages.find((x) => x.id === Number(b.dataset.edit))));
    }

    function editPointage(p) {
      if (!p) return;
      UI.prompt('Modifier le pointage', `
        <div class="row">
          <div class="field"><label>Date *</label><input id="pe-date" type="date" value="${UI.esc(p.date)}"></div>
          <div class="field"><label>Durée (h) *</label><input id="pe-dur" type="number" min="0.25" step="0.25" value="${p.duree}"></div>
        </div>
        <div class="field"><label>Statut</label><select id="pe-stat">${UI.options([{ id: '1', libelle: 'Effectué' }, { id: '0', libelle: 'Non effectué' }], p.effectue ? '1' : '0', null)}</select></div>
        <div class="field"><label>Motif (si non effectué)</label><input id="pe-mot" list="po-mt2" value="${UI.esc(p.motif || '')}">
          <datalist id="po-mt2">${PO_MOTIFS.filter(Boolean).map((m) => '<option value="' + UI.esc(m) + '">').join('')}</datalist></div>
      `, async (body) => {
        const date = body.querySelector('#pe-date').value;
        const duree = Number(body.querySelector('#pe-dur').value);
        if (!date || !(duree >= 0.25)) { UI.toast('Date et durée valides requises.', 'err'); return false; }
        p.date = date;
        p.duree = duree;
        p.effectue = body.querySelector('#pe-stat').value === '1';
        p.motif = (p.effectue ? '' : body.querySelector('#pe-mot').value.trim());
        await DB.put('pointages', p);
        UI.closeModal(); UI.toast('Pointage mis à jour.', 'ok'); await renderHist();
        return true;
      });
    }

    async function printFiche() {
      const { affectations, enseignants: ensList, matieres, classes } = await Data.common();
      const pointages = await DB.getAll('pointages') || [];
      const mois = Number(moisSel.value) || (now.getMonth() + 1);
      const annee = Number(anneeSel.value) || now.getFullYear();
      const rng = poMonthRange(mois, annee);
      const inMonth = poRange(pointages, rng.from, rng.to).slice().sort((a, b) => a.date.localeCompare(b.date));
      const eco = (await DB.get('ecole', 1)) || {};
      if (!inMonth.length) { UI.toast('Aucun pointage à imprimer pour ' + PO_MOIS[mois - 1] + ' ' + annee + '.', 'err'); return; }
      let html = '<table class="tbl" style="width:100%"><thead><tr><th>Date</th><th>Enseignant</th><th>Classe</th><th>Matière</th><th>Durée</th><th>Statut</th><th>Motif</th></tr></thead><tbody>' +
        inMonth.map((p) => {
          const en = ensList.find((e) => e.id === p.enseignantId);
          const ma = matieres.find((m) => m.id === p.matiereId);
          const cl = classes.find((c) => c.id === p.classeId);
          return '<tr><td>' + UI.dateFr(p.date) + '</td><td>' + UI.esc(en ? Data.personneNom(en) : '—') + '</td>' +
            '<td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td><td>' + UI.esc(ma ? ma.libelle : '—') + '</td>' +
            '<td>' + poFmtH(p.duree) + ' h</td>' +
            '<td>' + (p.effectue ? 'Effectué' : 'Non effectué') + '</td><td>' + UI.esc(p.motif || '') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div style="margin-top:12px;font-weight:700">Total effectué : ' + poFmtH(poSum(inMonth, true)) + ' h · Total non effectué : ' + poFmtH(poSum(inMonth, false)) + ' h</div>';
      UI.print(UI.letterhead(eco, { title: 'Fiche de pointage des cours' }, {}) +
        '<p><b>' + PO_MOIS[mois - 1] + ' ' + annee + '</b></p>' + html,
        'Fiche de pointage');
    }
  }
});

/* ============================================================
   HONORAIRES DES ENSEIGNANTS — heures pointées × taux horaire,
   sur une période définie. Intégration avec les salaires.
   ============================================================ */
App.register('honoraires', {
  title: 'Honoraires des enseignants',
  navLabel: 'Honoraires',
  icon: 'H',
  group: 'Finance',
  perm: 'honoraires.manage',
  render: async function (root) {
    const now = new Date();
    const defFrom = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
    root.innerHTML =
      '<div class="bar"><div class="card-title">Honoraires des enseignants — pointage</div>' +
      '<div class="toolbar" id="ho-tools"></div></div>' +
      '<div class="grid" id="ho-cards" style="margin-bottom:16px"></div>' +
      '<div class="bar"><div class="table-wrap" id="ho-list"></div></div>';
    const tools = root.querySelector('#ho-tools');
    const cardsEl = root.querySelector('#ho-cards');
    const listEl = root.querySelector('#ho-list');
    tools.innerHTML =
      '<label>Début</label><input type="date" id="ho-from" value="' + defFrom + '">' +
      '<label>Fin</label><input type="date" id="ho-to" value="' + UI.today() + '">' +
      '<label>Période</label><select id="ho-preset" style="width:auto"></select>' +
      '<button class="btn btn-outline" id="ho-print" title="Imprimer l\'état des honoraires">🖨 Imprimer</button>' +
      '<button class="btn btn-outline" id="ho-csv" title="Exporter en CSV">Export CSV</button>';
    const fromSel = tools.querySelector('#ho-from');
    const toSel = tools.querySelector('#ho-to');
    const presetSel = tools.querySelector('#ho-preset');
    const PRESETS = [
      { id: 'mois', label: 'Ce mois' },
      { id: 'prec', label: 'Mois dernier' },
      { id: '30j', label: '30 derniers jours' },
      { id: 'annee', label: 'Année en cours' },
      { id: 'tout', label: 'Depuis le début' }
    ];
    presetSel.innerHTML = UI.options(PRESETS.map((p) => ({ id: p.id, libelle: p.label })), 'mois', null);
    presetSel.onchange = () => {
      const p = presetSel.value;
      const y = now.getFullYear();
      if (p === 'mois') { fromSel.value = y + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01'; toSel.value = UI.today(); }
      else if (p === 'prec') { const d = new Date(y, now.getMonth() - 1, 1); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); fromSel.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; toSel.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(last).padStart(2, '0'); }
      else if (p === '30j') { const b = new Date(now); b.setDate(b.getDate() - 29); fromSel.value = b.toISOString().slice(0, 10); toSel.value = UI.today(); }
      else if (p === 'annee') { fromSel.value = y + '-01-01'; toSel.value = UI.today(); }
      else if (p === 'tout') { fromSel.value = ''; toSel.value = ''; }
      render();
    };
    ['ho-from', 'ho-to'].forEach((id) => tools.querySelector('#' + id).addEventListener('change', render));
    tools.querySelector('#ho-print').onclick = printEtat;
    tools.querySelector('#ho-csv').onclick = exportCsv;
    render();

    function periodLabels() {
      const from = fromSel.value;
      const to = toSel.value;
      if (!from && !to) return 'Depuis le début';
      if (!from) return 'Jusqu\'au ' + UI.dateFr(to);
      if (!to) return 'Depuis le ' + UI.dateFr(from);
      return 'du ' + UI.dateFr(from) + ' au ' + UI.dateFr(to);
    }

    // Agrégats par enseignant sur la période.
    async function aggregates() {
      const { affectations, enseignants, matieres, classes } = await Data.common();
      const pointages = await DB.getAll('pointages') || [];
      const from = fromSel.value;
      const to = toSel.value;
      const inRange = poRange(pointages, from, to);
      const perEns = {};
      inRange.forEach((p) => {
        const ensId = p.enseignantId;
        const b = perEns[ensId] || (perEns[ensId] = { eff: 0, non: 0, detail: {} });
        b.eff += Number(p.effectue ? (p.duree || 0) : 0);
        b.non += Number(!p.effectue ? (p.duree || 0) : 0);
        const aff = affectations.find((a) => a.enseignantId === ensId && a.matiereId === p.matiereId && a.classeId === p.classeId);
        const key = (aff ? aff.id : '-') + '|' + p.matiereId + '|' + p.classeId;
        const d = b.detail[key] || (b.detail[key] = { matiereId: p.matiereId, classeId: p.classeId, eff: 0, non: 0 });
        d.eff += Number(p.effectue ? (p.duree || 0) : 0);
        d.non += Number(!p.effectue ? (p.duree || 0) : 0);
      });
      Object.keys(perEns).forEach((k) => {
        perEns[k].eff = Math.round(perEns[k].eff * 100) / 100;
        perEns[k].non = Math.round(perEns[k].non * 100) / 100;
      });
      return { enseignants, matieres, classes, perEns, pointages: inRange, from, to };
    }

    async function render() {
      const { enseignants, matieres, classes, perEns, pointages } = await aggregates();
      const ids = Object.keys(perEns).map(Number);
      let totalEff = 0, totalNon = 0, totalMt = 0, sansTaux = 0;
      const rows = ids.map((id) => {
        const en = enseignants.find((e) => e.id === id);
        const b = perEns[id];
        const taux = Number(en && en.tauxHoraire) || 0;
        totalEff += b.eff; totalNon += b.non;
        const mt = Math.round(b.eff * taux);
        totalMt += mt;
        if (!(taux > 0)) sansTaux++;
        return '<tr>' +
          '<td><strong>' + UI.esc(en ? Data.personneNom(en) : '(supprimé)') + '</strong></td>' +
          '<td class="num">' + (taux > 0 ? UI.money(taux) + '/h' : '<span class="badge badge-warn" title="Définissez le taux horaire dans l\'onglet Enseignants">Manquant</span>') + '</td>' +
          '<td class="num"><b>' + poFmtH(b.eff) + ' h</b></td>' +
          '<td class="num">' + poFmtH(b.non) + ' h</td>' +
          '<td class="num"><b>' + UI.money(mt) + '</b></td>' +
          '<td class="actions-cell">' +
            '<button class="btn btn-sm btn-outline" data-det="' + id + '">Détail</button>' +
            '<button class="btn btn-sm btn-outline" data-fiche="' + id + '">Fiche</button>' +
            (mt > 0 ? '<button class="btn btn-sm btn-primary" data-pay="' + id + '">Verser</button>' : '') +
          '</td></tr>';
      }).join('');
      cardsEl.innerHTML =
        '<div class="stat-card"><div class="stat-icon" style="background:#2563eb">E</div>' +
        '<div class="stat-label">Enseignants concernés</div><div class="stat-value">' + ids.length + '</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#16a34a">✓</div>' +
        '<div class="stat-label">Heures effectuées</div><div class="stat-value">' + poFmtH(totalEff) + ' h</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#dc2626">✗</div>' +
        '<div class="stat-label">Heures non effectuées</div><div class="stat-value">' + poFmtH(totalNon) + ' h</div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#d97706">F</div>' +
        '<div class="stat-label">Total honoraires</div><div class="stat-value">' + UI.money(totalMt) + '</div></div>';
      listEl.innerHTML =
        '<div class="card-sub" style="margin-bottom:10px">Période définie : <b>' + periodLabels() + '</b> — ' + pointages.length + ' séance(s) pointée(s)' +
          (sansTaux ? ' · <span class="badge badge-warn">' + sansTaux + ' enseignant(s) sans taux horaire</span>' : '') + '</div>' +
        (rows ? UI.table(['Enseignant', 'Taux horaire', 'Heures effectuées', 'Heures non effectuées', 'Honoraires', 'Actions'], rows)
              : '<div class="empty">Aucun pointage sur cette période. Utilisez le module « Pointage » pour enregistrer les heures de cours.</div>');
      listEl.querySelectorAll('[data-det]').forEach((b) => b.onclick = () => detailModal(Number(b.dataset.det)));
      listEl.querySelectorAll('[data-fiche]').forEach((b) => b.onclick = () => ficheEnseignant(Number(b.dataset.fiche)));
      listEl.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => verserSalaire(Number(b.dataset.pay)));
    }

    function detailModal(ensId) {
      aggregates().then(({ enseignants, matieres, classes, perEns, from, to }) => {
        const en = enseignants.find((e) => e.id === ensId);
        const b = perEns[ensId];
        if (!en || !b) return;
        const taux = Number(en.tauxHoraire) || 0;
        const keys = Object.keys(b.detail);
        const rows = keys.map((k) => {
          const d = b.detail[k];
          const ma = matieres.find((m) => m.id === d.matiereId);
          const cl = classes.find((c) => c.id === d.classeId);
          const mt = Math.round(d.eff * taux);
          return '<tr><td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td>' +
            '<td>' + UI.esc(ma ? ma.libelle : '—') + '</td>' +
            '<td class="num">' + poFmtH(d.eff) + ' h</td>' +
            '<td class="num">' + poFmtH(d.non) + ' h</td>' +
            '<td class="num">' + UI.money(mt) + '</td></tr>';
        }).join('');
        UI.prompt('Détail des honoraires — ' + UI.esc(Data.personneNom(en)), `
          <div class="card-sub" style="margin-bottom:8px">Période : ${UI.esc(from && to ? 'du ' + UI.dateFr(from) + ' au ' + UI.dateFr(to) : (from ? 'depuis le ' + UI.dateFr(from) : (to ? "jusqu'au " + UI.dateFr(to) : 'depuis le début')))} · Taux : ${taux > 0 ? UI.esc(UI.money(taux)) + '/h' : 'non défini'}</div>
          <div class="table-wrap" style="max-height:280px;overflow:auto">${UI.table(['Classe', 'Matière', 'Effectué', 'Non effectué', 'Montant'], rows || UI.empty(5, 'Aucun détail'))}</div>
          <div style="margin-top:8px;text-align:right;font-weight:700">Total : ${UI.money(Math.round(b.eff * taux))}</div>
        `, async (body, close) => { close(); return true; }, { size: 'modal modal-lg', okLabel: 'Fermer' });
      });
    }

    function ficheEnseignant(ensId) {
      aggregates().then(({ enseignants, matieres, classes, perEns, from, to }) => {
        const en = enseignants.find((e) => e.id === ensId);
        const b = perEns[ensId];
        if (!en || !b) return;
        const taux = Number(en.tauxHoraire) || 0;
        DB.get('ecole', 1).then((eco) => {
          const keys = Object.keys(b.detail);
          const rows = keys.map((k) => {
            const d = b.detail[k];
            const ma = matieres.find((m) => m.id === d.matiereId);
            const cl = classes.find((c) => c.id === d.classeId);
            return '<tr><td>' + UI.esc(cl ? Data.classeLabel(cl) : '—') + '</td>' +
              '<td>' + UI.esc(ma ? ma.libelle : '—') + '</td>' +
              '<td class="num">' + poFmtH(d.eff) + ' h</td>' +
              '<td class="num">' + poFmtH(d.non) + ' h</td>' +
              '<td class="num">' + UI.money(Math.round(d.eff * taux)) + '</td></tr>';
          }).join('') +
            '<tr style="font-weight:700"><td colspan="2">Total</td>' +
            '<td class="num">' + poFmtH(b.eff) + ' h</td>' +
            '<td class="num">' + poFmtH(b.non) + ' h</td>' +
            '<td class="num">' + UI.money(Math.round(b.eff * taux)) + '</td></tr>';
          const html =
            '<h1 style="font-size:22px">HONORAIRES</h1>' +
            '<table class="tbl" style="width:100%;margin-top:8px">' +
            '<tr><td><b>Enseignant :</b> ' + UI.esc(Data.personneNom(en)) + '</td></tr>' +
            (en.matricule ? '<tr><td><b>Matricule :</b> ' + UI.esc(en.matricule) + '</td></tr>' : '') +
            '<tr><td><b>Période :</b> ' + UI.esc(from && to ? 'du ' + UI.dateFr(from) + ' au ' + UI.dateFr(to) : (from ? 'depuis le ' + UI.dateFr(from) : (to ? "jusqu'au " + UI.dateFr(to) : 'depuis le début'))) + '</td></tr>' +
            '<tr><td><b>Taux horaire :</b> ' + (taux > 0 ? UI.money(taux) + ' / heure' : 'non défini') + '</td></tr>' +
            '</table>' +
            '<div style="margin-top:12px;font-weight:700">Détail des heures pointées</div>' +
            UI.table(['Classe', 'Matière', 'Effectué', 'Non effectué', 'Honoraires'], rows) +
            '<div style="margin-top:14px;border-top:1px solid #333;padding-top:8px;display:flex;justify-content:space-between;font-weight:700"><span>Total honoraires</span><span>' + UI.money(Math.round(b.eff * taux)) + '</span></div>' +
            '<div style="margin-top:30px;display:flex;justify-content:space-between"><span style="width:45%;border-top:1px solid #333;padding-top:4px;text-align:center">Le Directeur</span><span style="width:45%;border-top:1px solid #333;padding-top:4px;text-align:center">L\'Enseignant</span></div>';
          UI.print(UI.letterhead(eco, { title: 'État des honoraires' }, {}) + html, 'Honoraires — ' + Data.personneNom(en));
        });
      });
    }

    function verserSalaire(ensId) {
      aggregates().then(async ({ enseignants, perEns, from, to }) => {
        const en = enseignants.find((e) => e.id === ensId);
        const b = perEns[ensId];
        const taux = Number(en && en.tauxHoraire) || 0;
        const mt = Math.round(b.eff * taux);
        if (!en || !(mt > 0)) { UI.toast('Aucun honoraire à verser pour cet enseignant (heures effectuées × taux).', 'err'); return; }
        const ref = new Date(to || from || UI.today());
        if (isNaN(ref)) ref = new Date();
        const mois = ref.getMonth() + 1;
        const annee = ref.getFullYear();
        UI.confirm('Verser ' + UI.money(mt) + ' à ' + Data.personneNom(en) + ' pour ' + PO_MOIS[mois - 1] + ' ' + annee + ' ? (ligne ajoutée au module Salaires)', async () => {
          const salaires = await DB.getAll('salaires') || [];
          const ex = salaires.find((s) => s.enseignantId === ensId && s.mois === mois && s.annee === annee && String(s.note || '').indexOf('Honoraires') === 0);
          if (ex) {
            ex.montant = mt; ex.date = UI.today(); ex.statut = 'paye';
            await DB.put('salaires', ex);
            UI.toast('Honoraire mis à jour dans Salaires.', 'ok');
          } else {
            await DB.add('salaires', {
              enseignantId: ensId, mois: mois, annee: annee, montant: mt,
              date: UI.today(), statut: 'paye', note: 'Honoraires — pointage (' + periodLabels() + ')',
              dateCreation: UI.nowIso()
            });
            UI.toast('Honoraire versé : ligne créée dans Salaires.', 'ok');
          }
          await render();
        }, { title: 'Verser un honoraire', yesLabel: 'Verser' });
      });
    }

    function exportCsv() {
      aggregates().then(({ enseignants, perEns }) => {
        const rows = Object.keys(perEns).map((id) => {
          const en = enseignants.find((e) => e.id === Number(id));
          const b = perEns[id];
          const taux = Number(en && en.tauxHoraire) || 0;
          return [Data.personneNom(en), String(taux).replace('.', ','), String(b.eff).replace('.', ','), String(b.non).replace('.', ','), String(Math.round(b.eff * taux))];
        });
        Store.downloadCSV(['Enseignant', 'Taux (FCFA/h)', 'Heures effectuées', 'Heures non effectuées', 'Honoraires (FCFA)'], rows, 'honoraires.csv');
      });
    }

    async function printEtat() {
      const { enseignants, perEns, from, to } = await aggregates();
      if (!Object.keys(perEns).length) { UI.toast('Aucun honoraire à imprimer sur cette période.', 'err'); return; }
      const eco = (await DB.get('ecole', 1)) || {};
      const rows = Object.keys(perEns).map((id) => {
        const en = enseignants.find((e) => e.id === Number(id));
        const b = perEns[id];
        const taux = Number(en && en.tauxHoraire) || 0;
        return '<tr><td>' + UI.esc(Data.personneNom(en)) + '</td><td class="num">' + (taux > 0 ? UI.money(taux) + '/h' : '—') + '</td>' +
          '<td class="num">' + poFmtH(b.eff) + ' h</td><td class="num">' + poFmtH(b.non) + ' h</td>' +
          '<td class="num"><b>' + UI.money(Math.round(b.eff * taux)) + '</b></td></tr>';
      }).join('');
      UI.print(UI.letterhead(eco, { title: 'État des honoraires — pointage des cours' }, {}) +
        '<p><b>Période définie :</b> ' + UI.esc(from && to ? 'du ' + UI.dateFr(from) + ' au ' + UI.dateFr(to) : 'depuis le début') + '</p>' +
        UI.table(['Enseignant', 'Taux', 'Heures effectuées', 'Heures non effectuées', 'Montant'], rows),
        'État des honoraires');
    }
  }
});

// ---------------------------------------------------------------------------
// Contrôle & vérification des volumes horaires
// ---------------------------------------------------------------------------
App.register('controle', {
  title: 'Contrôle des heures',
  navLabel: 'Contrôle des heures',
  icon: 'C',
  group: 'Pédagogie',
  perm: 'controle.heures',

  render(root) {
    const p = this._panel();
    p.appendChild(this._sectionVide());
    if (root && root.appendChild) root.appendChild(p);
    this._reload(p);
  },

  _reload(p) {
    this._loadAll().then((d) => {
      if (!d) return;
      this._tools(p);
      this._render(d, p);
    });
  },

  // Barre d'outils : classe, enseignant, période, date de contrôle
  _tools(p) {
    const ex = (window.external && window.external.control) || {};
    const cur = ex.ctrlControle || {};
    this._loadAll().then((d) => {
      if (!d) return;
      const clOpts = UI.options(d.cl.map((c) => ({ id: c.id, libelle: Data.classeLabel(c) })), cur.cl || '', 'Toutes les classes');
      const enOpts = UI.options(d.ens.map((e) => ({ id: e.id, libelle: Data.personneNom(e) })), cur.ens || '', 'Tous les enseignants');
      const tools = document.createElement('div');
      tools.className = 'toolbar';
      tools.id = 'ct-tools';
      tools.innerHTML =
        '<div class="chip">Classe</div><select id="ct-cl">' + clOpts + '</select>' +
        '<div class="chip">Enseignant</div><select id="ct-ens">' + enOpts + '</select>' +
        '<div class="chip">Période (conformité du pointage)</div>' +
        '<div class="dtd"><label>Du</label><input type="date" id="ct-from" value="' + UI.esc(cur.from || '') + '"></div>' +
        '<div class="dtd"><label>Au</label><input type="date" id="ct-to" value="' + UI.esc(cur.to || '') + '"></div>' +
        '<div class="dtd"><label>Contrôle du</label><input type="date" id="ct-date" value="' + UI.esc(cur.date || UI.today()) + '"></div>' +
        '<button class="btn" id="ct-print"><i class="icon">🖨</i>Imprimer</button>';
      const old = p.querySelector('#ct-tools');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      const body = p.querySelector('#ct-body');
      if (body && body.parentNode) p.insertBefore(tools, body);
      ex.ctrlControle = {
        from: cur.from || '', to: cur.to || '', date: cur.date || null,
        ens: cur.ens || '', cl: cur.cl || ''
      };
      const ext = ex;
      const save = (k, v) => { const e = ext.ctrlControle || {}; e[k] = v; ext.ctrlControle = e; this._reload(p); };
      p.querySelector('#ct-cl').addEventListener('change', (ev) => save('cl', ev.target.value));
      p.querySelector('#ct-ens').addEventListener('change', (ev) => save('ens', ev.target.value));
      p.querySelector('#ct-from').addEventListener('change', (ev) => save('from', ev.target.value));
      p.querySelector('#ct-to').addEventListener('change', (ev) => save('to', ev.target.value));
      p.querySelector('#ct-date').addEventListener('change', (ev) => save('date', ev.target.value));
      p.querySelector('#ct-print').addEventListener('click', () => this._printCur());
    });
  },

  _panel() {
    const p = document.createElement('div');
    p.className = 'page';
    p.id = 'ct-page';
    p.innerHTML = '<div class="bar"><div class="bar-head"><div class="card-title">Contrôle &amp; vérification des volumes horaires</div></div></div>';
    return p;
  },
  _sectionVide() {
    const s = document.createElement('div');
    s.id = 'ct-body';
    s.innerHTML = '<p class="muted" style="padding:16px">Chargement…</p>';
    return s;
  },

  _loadAll() {
    return Promise.all([
      DB.getAll('affectations'), DB.getAll('enseignants'), DB.getAll('classes'),
      DB.getAll('matieres'), DB.get('ecole', 1), DB.getAll('emplois'), DB.getAll('pointages')
    ]).then((r) => {
      if (!r || !r[0]) return null;
      const raw = {
        affs: r[0] || [], ens: r[1] || [], cl: r[2] || [], mat: r[3] || [], eco: r[4] || {},
        loans: r[5] || [], pts: r[6] || []
      };
      return {
        affs: raw.affs, ens: raw.ens, cl: raw.cl, mat: raw.mat, eco: raw.eco,
        emplois: raw.loans, pts: raw.pts
      };
    }).catch(() => null);
  },

  _filters(d) {
    const f = this._ctlF();
    const clId = f.cl ? Number(f.cl) : 0;
    const ensId = f.ens ? Number(f.ens) : 0;
    const affs = d.affs.filter((a) => (!clId || a.classeId === clId) && (!ensId || a.enseignantId === ensId));
    return { f, clId, ensId, mat: d.mat, cl: d.cl, affs, ens: d.ens };
  },

  _ctlF() {
    const enc = (window.external && window.external.control && window.external.control.ctrlControle) || {};
    return { cl: enc.cl || '', ens: enc.ens || '', from: enc.from || '', to: enc.to || '', date: enc.date || UI.today() };
  },

  _render(d, p) {
    const body = p.querySelector('#ct-body');
    const b = this._filters(d);
    const affRows = this._tableAff(d, b);
    const capCards = this._cardsCap(d);
    const capTable = this._tableCap(d, b.ens.filter((e) => (!b.ensId || e.id === b.ensId)));
    const ptTable = this._tablePt(d, b);
    const detail = this._tableDetail(d, b);
    body.innerHTML =
      this._barSection('1. Volume octroyé à l\u2019affectation vs volume programmé à l\u2019emploi du temps (semaine type)', affRows) +
      this._barSection('2. Charge hebdomadaire octroyée vs capacité normale de l\u2019enseignant', capCards + capTable) +
      this._barSection('3. Conformité du pointage au volume programmé (emploi du temps)', ptTable) +
      this._barSection('4. Détail du contrôle — lignes de pointage vs séances programmées', detail);
    const dd = p.querySelector('#ct-date');
    const hi = p.querySelector('#ct-hint');
    if (hi) hi.innerHTML = 'Séances programmées repérées sur la date <b>' + UI.esc(UI.dateFr(dd ? dd.value : '')) + '</b>, comparées aux lignes de pointage de ce même jour.';
  },

  _barSection(title, inner) {
    return '<div class="bar"><div class="bar-head"><div class="card-title">' + UI.esc(title) + '</div></div><div class="bar-body">' + inner + '</div></div>';
  },

  _tableAff(d, b) {
    if (!d.emplois.length) return '<p class="muted">Aucune séance programmée à l\u2019emploi du temps.</p>';
    if (!b.affs.length) return '<p class="muted">Aucune affectation pour ce filtre.</p>';
    const rows = b.affs.map((a) => {
      const oct = poOctroyeHebdo(a);
      const prog = poProgrammeHebdo(d.emplois, a.enseignantId, a.matiereId, a.classeId);
      const ec = prog - oct;
      return '<tr>' +
        '<td>' + UI.esc((b.cl.find((c) => c.id === a.classeId) || { nom: '?' }).nom) + '</td>' +
        '<td>' + UI.esc((b.mat.find((m) => m.id === a.matiereId) || { nom: '?' }).nom) + '</td>' +
        '<td>' + UI.esc(Data.personneNom(b.ens.find((e) => e.id === a.enseignantId))) + '</td>' +
        '<td class="num">' + poFmtH(oct) + ' h</td>' +
        '<td class="num">' + poFmtH(prog) + ' h</td>' +
        '<td class="num">' + poFmtH(ec) + ' h</td>' +
        '<td>' + poBadgeChg(ec) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      ['Classe', 'Matière', 'Enseignant', 'Octroyé (h/sem)', 'Programmé (h/sem)', 'Écart', 'Contrôle']
        .map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted">Écart = programmé − octroyé à l\u2019affectation. Un volume positif (surchargé) ou négatif (sous-programmé) révèle une incohérence à corriger.</p>';
  },

  _cardsCap(d) {
    const ensMap = new Map(d.ens.map((e) => [e.id, Number(e.capaciteHebdo) || PO_CAPACITE_DEFAUT]));
    const charge = new Map();
    d.affs.forEach((a) => { charge.set(a.enseignantId, (charge.get(a.enseignantId) || 0) + poOctroyeHebdo(a)); });
    let n = 0, sur = 0, tot = 0;
    d.ens.forEach((e) => {
      const c = charge.get(e.id) || 0;
      n++;
      tot += c;
      if (c > (ensMap.get(e.id) || PO_CAPACITE_DEFAUT)) sur++;
    });
    const moy = n ? tot / n : 0;
    return '<div class="grid">' +
      '<div class="card-ph"><b>' + n + '</b><span>enseignants</span></div>' +
      '<div class="card-ph"><b>' + poFmtH(moy) + ' h</b><span>charge moyenne / semaine</span></div>' +
      '<div class="card-ph"><b>' + sur + '</b><span>en surcharge</span></div>' +
      '<div class="card-ph"><b>' + (n ? Math.round((100 * sur) / n) : 0) + ' %</b><span>taux de surcharge</span></div>' +
      '</div>';
  },

  _tableCap(d, ensList) {
    if (!ensList.length) return '';
    const rows = ensList.map((e) => {
      const charge = d.affs.filter((a) => a.enseignantId === e.id)
        .reduce((s, a) => s + poOctroyeHebdo(a), 0);
      const cap = Number(e.capaciteHebdo) || PO_CAPACITE_DEFAUT;
      const pct = cap > 0 ? Math.round((100 * charge) / cap) : 0;
      return '<tr>' +
        '<td>' + UI.esc(Data.personneNom(e)) + '</td>' +
        '<td class="num">' + poFmtH(charge) + ' h</td>' +
        '<td class="num">' + poFmtH(cap) + ' h</td>' +
        '<td class="num">' + pct + ' %</td>' +
        '<td>' + poBadgeCap(pct) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      ['Enseignant', 'Charge octroyée (h/sem)', 'Capacité (h/sem)', 'Taux', 'Contrôle']
        .map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted">Capacité par défaut : 24 h/semaine (modifiable sur la fiche de l\u2019enseignant).</p>';
  },

  _tablePt(d, b) {
    if (!d.emplois.length) return '<p class="muted">Aucune séance programmée à l\u2019emploi du temps.</p>';
    const { from, to } = b.f;
    const fromD = from || '', toD = to || '';
    const rows = d.ens.filter((e) => (!b.ensId || e.id === b.ensId)).map((e) => {
      const prog = poProgrammePeriode(d.emplois, e.id, fromD, toD);
      const pts = d.pts.filter((p) => p.enseignantId === e.id && (!fromD || p.date >= fromD) && (!toD || p.date <= toD));
      const eff = poSum(pts, true);
      const non = poSum(pts, false);
      const ec = (eff + non) - prog;
      return '<tr>' +
        '<td>' + UI.esc(Data.personneNom(e)) + '</td>' +
        '<td class="num">' + poFmtH(prog) + ' h</td>' +
        '<td class="num">' + poFmtH(eff) + ' h</td>' +
        '<td class="num">' + poFmtH(non) + ' h</td>' +
        '<td class="num">' + poFmtH(ec) + ' h</td>' +
        '<td>' + poBadgeEc(ec) + '</td>' +
        '</tr>';
    }).join('');
    return '<p id="ct-hint" class="muted"><b>Période :</b> ' + UI.esc(fromD ? 'du ' + UI.dateFr(fromD) + ' au ' + (toD ? UI.dateFr(toD) : '…') : 'depuis le début') + '</p>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      ['Enseignant', 'Programmé (h)', 'Pointé effectué (h)', 'Pointé non effectué (h)', 'Écart', 'Contrôle']
        .map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted">Écart = (effectuées + non effectuées) − programmé à l\u2019emploi du temps sur la période. Un excédent indique un pointage au-delà du volume programmé, un déficit un pointage incomplet.</p>';
  },

  _tableDetail(d, b) {
    const dd = b.f.date;
    const help = 'La date du contrôle est fixée dans la barre d\u2019outils ci-dessus.';
    if (!dd) return '<p class="muted">' + help + '</p>';
    const wd = (new Date(dd).getDay());
    const ensSel = b.ensId;
    const abs = [];
    const hors = [];
    d.emplois.forEach((c) => {
      if (ensSel && c.enseignantId !== ensSel) return;
      if ((Number(c.jour) + 1) % 7 !== wd) return;
      const pt = d.pts.some((p) => p.date === dd && p.enseignantId === c.enseignantId && p.matiereId === c.matiereId && p.classeId === c.classeId);
      if (!pt) {
        abs.push('<tr>' +
          '<td>' + UI.esc(Data.personneNom(b.ens.find((e) => e.id === c.enseignantId))) + '</td>' +
          '<td>' + UI.esc((b.cl.find((x) => x.id === c.classeId) || { nom: '?' }).nom) + '</td>' +
          '<td>' + UI.esc((b.mat.find((m) => m.id === c.matiereId) || { nom: '?' }).nom) + '</td>' +
          '<td class="num">' + durFr(c) + '</td><td class="num">' + coursTimeLabel(c) + '</td>' +
          '</tr>');
      }
    });
    d.pts.forEach((p) => {
      if (ensSel && p.enseignantId !== ensSel) return;
      if (p.date !== dd) return;
      const prog = d.emplois.some((c) => c.enseignantId === p.enseignantId && c.matiereId === p.matiereId && c.classeId === p.classeId);
      if (!prog) {
        hors.push('<tr>' +
          '<td>' + UI.esc(Data.personneNom(b.ens.find((e) => e.id === p.enseignantId))) + '</td>' +
          '<td>' + UI.esc((b.cl.find((x) => x.id === p.classeId) || { nom: '?' }).nom) + '</td>' +
          '<td>' + UI.esc((b.mat.find((m) => m.id === p.matiereId) || { nom: '?' }).nom) + '</td>' +
          '<td class="num">' + poFmtH(p.duree) + ' h</td>' +
          '<td>' + (p.effectue ? '<span class="badge badge-ok">Effectué</span>' : '<span class="badge badge-warn">Non effectué</span>') + '</td>' +
          '</tr>');
      }
    });
    let out = '<p class="muted"><b>Date du contrôle :</b> ' + UI.esc(UI.dateFr(dd)) + ', <b>' + UI.esc(wd === 0 ? 'Dimanche' : JOURS[wd - 1]) + '</b></p>';
    out += '<div class="bar-head"><div class="card-title">Séances programmées sans pointage (' + abs.length + ')</div></div>' +
      (abs.length ? '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      ['Enseignant', 'Classe', 'Matière', 'Durée', 'Plage horaire'].map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + abs.join('') + '</tbody></table></div>'
        : '<p class="muted">Aucune séance en attente de pointage.</p>');
    out += '<div class="bar-head"><div class="card-title">Pointages hors programme (' + hors.length + ')</div></div>' +
      (hors.length ? '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      ['Enseignant', 'Classe', 'Matière', 'Durée', 'Statut'].map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + hors.join('') + '</tbody></table></div>'
        : '<p class="muted">Aucun pointage hors programme.</p>');
    return out;
  },

  _printCur() {
    const enc = (window.external && window.external.control && window.external.control.ctrlControle) || {};
    const f = { ens: enc.ens || '', cl: enc.cl || '', from: enc.from || '', to: enc.to || '', date: enc.date || UI.today() };
    Promise.all([
      DB.getAll('affectations'), DB.getAll('enseignants'), DB.getAll('classes'),
      DB.getAll('matieres'), DB.get('ecole', 1), DB.getAll('emplois'), DB.getAll('pointages')
    ]).then((r) => {
      const d = r && r[0] ? {
        affs: r[0] || [], ens: r[1] || [], cl: r[2] || [], mat: r[3] || [],
        eco: r[4] || {}, emplois: r[5] || [], pts: r[6] || []
      } : null;
      if (!d) { UI.toast('Impossible de générer le contrôle.', 'err'); return; }
      const b = { f, clId: f.cl ? Number(f.cl) : 0, ensId: f.ens ? Number(f.ens) : 0, mat: d.mat, cl: d.cl, ens: d.ens };
      b.affs = d.affs.filter((a) => (!b.clId || a.classeId === b.clId) && (!b.ensId || a.enseignantId === b.ensId));
      const html =
        '<h3>Contrôle des volumes horaires</h3>' +
        '<p class="muted">Classe : ' + UI.esc(f.cl || 'toutes') + ' — Enseignant : ' + UI.esc(f.ens || 'tous') +
        ' — Période pointage : ' + UI.esc((f.from || f.to) ? 'du ' + (f.from || '…') + ' au ' + (f.to || '…') : 'depuis le début') +
        ' — Date de contrôle : ' + UI.esc(UI.dateFr(f.date)) + '</p>' +
        '<h4>1. Affectation vs emploi du temps (semaine type)</h4>' + this._tableAff(d, b) +
        '<h4>2. Charge vs capacité des enseignants</h4>' + this._tableCap(d, b.ens.filter((e) => (!b.ensId || e.id === b.ensId))) +
        '<h4>3. Pointage vs programmé (période)</h4>' + this._tablePt(d, b) +
        '<h4>4. Détail du contrôle — séances et pointages</h4>' + this._tableDetail(d, b);
      UI.print(UI.letterhead(d.eco, { title: 'Contrôle des volumes horaires' }, {}) + html, 'Contrôle des volumes horaires');
    }).catch(() => UI.toast('Impossible de générer le contrôle.', 'err'));
  }
});