/* ============================================================
   emplois.js — Emplois du temps (classe & enseignant)
   Chaque cours possède une heure de début et une durée (en heures) ;
   l'heure de fin est calculée : début + durée.
   ============================================================ */
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Horaires de début des anciens créneaux (legacy : migration des cours existants)
const LEGACY_PERIODES = [
  { n: 1, debut: '08:00' }, { n: 2, debut: '09:00' }, { n: 3, debut: '10:00' }, { n: 4, debut: '11:00' },
  { n: 5, debut: '14:00' }, { n: 6, debut: '15:00' }, { n: 7, debut: '16:00' }
];

function hmToMin(hhmm) {
  if (!hhmm) return 0;
  const p = String(hhmm).split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}
function minToHm(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function addMinutes(hhmm, mins) { return minToHm(hmToMin(hhmm) + mins); }
// Heure de début d'un cours (repli sur les anciens créneaux)
function coursDebut(e) {
  if (e && e.debut) return e.debut;
  const legacy = LEGACY_PERIODES.find(s => s.n === (e && e.periode));
  return legacy ? legacy.debut : '08:00';
}
// Heure de fin calculée : début + durée
function coursFin(e) { return addMinutes(coursDebut(e), Math.round((Number(e && e.duree) || 1) * 60)); }
function durFr(d) {
  const v = Number(d) || 1;
  return (v % 1 === 0 ? v : String(v).replace('.', ',')) + ' h';
}
function coursTimeLabel(e) {
  return coursDebut(e) + ' → ' + coursFin(e) + ' (' + durFr(e && e.duree) + ')';
}

App.register('emplois', {
  title: 'Emplois du temps',
  navLabel: 'Emplois du temps',
  icon: 'E',
  group: 'Emplois',
  perm: 'emplois.view',
  render: async function (root, ctx) {
    const isTeacher = Auth.currentUser().role === 'enseignant';
    const isStudent = Auth.currentUser().role === 'eleve';
    root.innerHTML = '<div class="bar"><div class="card-title">Emploi du temps</div>' +
      '<div class="toolbar" id="edt-toolbar"></div></div>' +
      '<div class="bar" id="edt-body"></div>';
    const toolbar = root.querySelector('#edt-toolbar');

    if (isTeacher) { await renderTeacher(ctx.enseignantId); return; }
    if (isStudent) { await renderStudent(); return; }

    const classes = await DB.getAll('classes');
    toolbar.innerHTML = '<label>Classe</label><select id="edt-classe" style="width:220px">' +
      UI.options(classes.map(c => ({ id: c.id, libelle: Data.classeLabel(c) })), ctx && ctx.classeId, 'Choisir…') + '</select>' +
      '<label>Enseignant</label><select id="edt-ens"><option value="">— Tous —</option></select>' +
      '<button class="btn btn-primary" id="edt-add">+ Cours</button>' +
      '<button class="btn btn-outline" id="edt-print" title="Imprimer l\'emploi du temps">🖨 Imprimer</button>';
    const classeSel = toolbar.querySelector('#edt-classe');
    const ensSel = toolbar.querySelector('#edt-ens');
    const enseignants = await DB.getAll('enseignants');
    ensSel.innerHTML = UI.options(enseignants.map(e => ({ id: e.id, libelle: Data.personneNom(e) })), '', '— Tous —');
    let lastGrid = '';
    let lastClasse = null;
    let rowTimes = [];

    async function reload() {
      const clId = Number(classeSel.value);
      const ensId = ensSel.value ? Number(ensSel.value) : null;
      if (!clId) { root.querySelector('#edt-body').innerHTML = '<div class="notice">Choisissez une classe pour afficher l\'emploi du temps.</div>'; return; }
      await renderGrid(clId, ensId);
    }
    classeSel.onchange = reload;
    ensSel.onchange = reload;
    toolbar.querySelector('#edt-add').onclick = async () => {
      try { await addCours(Number(classeSel.value)); }
      catch (err) { UI.toast('Erreur lors de l\'ajout du cours : ' + (err && err.message || err), 'err'); }
    };
    toolbar.querySelector('#edt-print').onclick = () => printCreneaux();
    if (classes.length) reload(); else root.querySelector('#edt-body').innerHTML = '<div class="notice-warn notice">Créez d\'abord des classes.</div>';

    async function renderGrid(clId, ensId) {
      const body = root.querySelector('#edt-body');
      const { affectations, matieres, enseignants, emplois, salles, classes } = await Data.common();
      const cl = classes.find(c => c.id === clId);
      const clMats = affectations.filter(a => a.classeId === clId).map(a => matieres.find(m => m.id === a.matiereId)).filter(Boolean);
      let cells = emplois.filter(e => e.classeId === clId);
      if (ensId) cells = cells.filter(e => e.enseignantId === ensId);
      const rows = [];
      const rowIndex = {};
      cells.forEach(c => {
        const t = coursDebut(c);
        if (rowIndex[t] === undefined) { rowIndex[t] = rows.length; rows.push(t); }
      });
      rows.sort();
      lastClasse = cl;
      rowTimes = rows;
      if (!rows.length) {
        body.innerHTML = clMats.length
          ? '<div class="notice">Aucun cours. Utilisez « + Cours » pour ajouter un cours.</div>'
          : '<div class="notice-warn notice">Aucune matière n\'est affectée à cette classe. Ajoutez des affectations d\'abord.</div>';
        lastGrid = '';
        return;
      }
      let html = '<table class="edt"><thead><tr><th style="width:90px">Début</th>' +
        JOURS.map(j => '<th>' + j + '</th>').join('') + '</tr></thead><tbody>';
      rows.forEach((t, ri) => {
        html += '<tr><th>' + UI.esc(t) + '</th>';
        for (let j = 0; j < JOURS.length; j++) {
          const e = cells.find(x => x.jour === j && coursDebut(x) === t);
          if (e) {
            const m = matieres.find(mm => mm.id === e.matiereId);
            const en = enseignants.find(x => x.id === e.enseignantId);
            const sa = e.salleId ? salles.find(s => s.id === e.salleId) : null;
            html += '<td><div class="edt-cell">' +
              '<strong>' + UI.esc(m ? m.libelle : '') + '</strong>' +
              '<span class="sub">' + UI.esc(en ? Data.personneNom(en) : '') + (sa ? ' · ' + UI.esc(sa.libelle) : '') + '</span>' +
              '<span class="sub edt-time">' + coursTimeLabel(e) + '</span>' +
              '<div><button class="btn btn-sm btn-ghost" data-e="' + e.id + '" title="Modifier">✎</button>' +
              '<button class="btn btn-sm btn-ghost" data-ed="' + e.id + '" title="Supprimer">✕</button></div>' +
              '</div></td>';
          } else {
            html += '<td><button class="btn btn-sm btn-ghost" data-new="' + ri + '_' + j + '" title="Ajouter" style="color:#cbd5e1">+</button></td>';
          }
        }
        html += '</tr>';
      });
      html += '</tbody></table>';
      if (!clMats.length) html += '<div class="notice-warn notice">Aucune matière n\'est affectée à cette classe. Ajoutez des affectations d\'abord.</div>';
      body.innerHTML = html;
      lastGrid = buildPrintTable(cells, matieres, enseignants, salles, JOURS);
      bindGrid();
      async function bindGrid() {
        body.querySelectorAll('[data-new]').forEach((b) => b.onclick = async () => {
          try {
            const [ri, j] = b.dataset.new.split('_').map(Number);
            await addCours(clId, rowTimes[ri], j);
          } catch (err) { UI.toast('Erreur : ' + (err && err.message || err), 'err'); }
        });
        body.querySelectorAll('[data-e]').forEach((b) => b.onclick = async () => {
          try {
            const e = emplois.find(x => x.id === Number(b.dataset.e));
            await populateCours(clId, e);
          } catch (err) { UI.toast('Erreur : ' + (err && err.message || err), 'err'); }
        });
        body.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => {
          const e = emplois.find(x => x.id === Number(b.dataset.ed));
          UI.confirm('Supprimer ce cours ?', async () => { await DB.del('emplois', e.id); reload(); }, { title: 'Supprimer cours' });
        });
      }
    }

    async function addCours(clId, debut, jour) {
      if (!clId) { UI.toast('Choisissez une classe.', 'err'); return; }
      await populateCours(clId, null, debut, jour);
    }

    async function populateCours(clId, e, debutPreset, jourPreset) {
      const { affectations, matieres, enseignants, salles, emplois } = await Data.common();
      const clAffs = affectations.filter(a => a.classeId === clId);
      const matOpts = clAffs.map(a => {
        const m = matieres.find(mm => mm.id === a.matiereId);
        return m ? { id: m.id, libelle: m.libelle, ensId: a.enseignantId } : null;
      }).filter(Boolean);
      if (!matOpts.length) { UI.toast('Cette classe n\'a pas de matières affectées : ajoutez d\'abord des affectations (Pédagogie → Affectations).', 'err'); return; }
      const ensOpts = clAffs.map(a => {
        const m = matieres.find(mm => mm.id === a.matiereId);
        const en = enseignants.find(x => x.id === a.enseignantId);
        return m && en ? { id: m.id, label: m.libelle, ensId: en.id, ensLib: Data.personneNom(en) } : null;
      }).filter(Boolean);
      const dups = {};
      ensOpts.forEach(o => { if (!dups[o.id]) dups[o.id] = o; });
      const unique = Object.values(dups);
      const eMatId = e ? e.matiereId : (unique[0] ? unique[0].id : '');
      const eJour = e ? e.jour : (jourPreset != null ? jourPreset : 0);
      const eDebut = e ? coursDebut(e) : (debutPreset || '08:00');
      // Durées de cours issues de l'affectation (matière ↔ classe) ; repli sur 1 h
      const dureesOf = (matId) => {
        const aff = clAffs.find(a => a.matiereId === Number(matId));
        const ds = (aff && aff.durees && aff.durees.length ? aff.durees.slice() : [1]).filter(d => Number(d) > 0);
        return ds.length ? ds.sort((x, y) => x - y) : [1];
      };
      const durOptions = (matId, current) => {
        const ds = dureesOf(matId);
        const cur = Number(current);
        if (cur && ds.indexOf(cur) < 0) ds.push(cur);
        return ds.map(d => '<option value="' + d + '"' + (cur && cur === d ? ' selected' : '') + '>' + durFr(d) + '</option>').join('');
      };
      const eDuree = e ? (e.duree || 1) : 1;
      UI.prompt(e ? 'Modifier le cours' : 'Nouveau cours', `
        <div class="row">
          <div class="field"><label>Jour *</label><select id="ed-jour">${UI.options(JOURS.map((j, i) => ({ id: i, libelle: j })), eJour, null)}</select></div>
          <div class="field"><label>Heure de début *</label><input id="ed-debut" type="time" value="${UI.esc(eDebut)}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Durée du cours (en heures) *</label><select id="ed-duree">${durOptions(eMatId, eDuree)}</select>
            <small class="hint">Durées définies à l'affectation de cette matière à la classe.</small></div>
          <div class="field"><label>Horaires calculés (début → fin)</label><input id="ed-calc" readonly value=""></div>
        </div>
        <div class="field"><label>Matière *</label><select id="ed-mat">${UI.options(unique.map(o => ({ id: o.id, libelle: o.label + ' — ' + o.ensLib })), eMatId, 'Choisir…')}</select></div>
        <div class="field"><label>Salle</label><select id="ed-salle">${UI.options(salles.map(s => ({ id: s.id, libelle: s.libelle })), (e && e.salleId) || '', '—')}</select></div>
        <small class="hint">L'heure de fin est calculée automatiquement : début + durée.</small>
      `, async (body) => {
        const jour = Number(body.querySelector('#ed-jour').value);
        const debut = body.querySelector('#ed-debut').value;
        const matId = Number(body.querySelector('#ed-mat').value);
        const duree = Math.max(0.25, Number(body.querySelector('#ed-duree').value) || 1);
        if (!matId) { UI.toast('Choisissez une matière.', 'err'); return false; }
        if (!debut) { UI.toast('Heure de début requise.', 'err'); return false; }
        const aff = clAffs.find(a => a.matiereId === matId);
        const overlap = emplois.find(x => x.classeId === clId && x.jour === jour && x.id !== (e ? e.id : null) &&
          hmToMin(coursDebut(x)) < hmToMin(addMinutes(debut, Math.round(duree * 60))) &&
          hmToMin(debut) < hmToMin(coursFin(x)));
        if (overlap && !e) { UI.toast('Un cours se chevauche déjà sur ce créneau.', 'err'); return false; }
        const obj = {
          classeId: clId,
          matiereId: matId,
          enseignantId: aff ? aff.enseignantId : null,
          salleId: Number(body.querySelector('#ed-salle').value) || null,
          jour, debut, duree
        };
        if (e) { obj.id = e.id; await DB.put('emplois', obj); } else await DB.add('emplois', obj);
        UI.closeModal(); UI.toast('Cours enregistré.', 'ok'); reload();
        return true;
      });
      // calcul des horaires en direct ; la durée suit les durées de l'affectation de la matière choisie
      const edDeb = document.querySelector('#ed-debut');
      const edDur = document.querySelector('#ed-duree');
      const edCalc = document.querySelector('#ed-calc');
      const edMat = document.querySelector('#ed-mat');
      if (edDeb && edDur && edCalc) {
        const updateCalc = () => {
          const d = edDeb.value;
          const du = Number(edDur.value) || 1;
          edCalc.value = d ? (d + ' → ' + addMinutes(d, Math.round(du * 60)) + ' (' + durFr(du) + ')') : '';
        };
        edDeb.oninput = updateCalc;
        edDur.oninput = updateCalc;
        edDur.onchange = updateCalc;
        if (edMat) edMat.addEventListener('change', () => {
          edDur.innerHTML = durOptions(Number(edMat.value), null);
          updateCalc();
        });
        updateCalc();
      }
    }

    // Construit une grille statique (sans boutons) pour l'impression.
    function buildPrintTable(cells, matieres, enseignants, salles, jours) {
      const rows = [];
      const idx = {};
      cells.forEach(c => { const t = coursDebut(c); if (idx[t] === undefined) { idx[t] = rows.length; rows.push(t); } });
      rows.sort();
      let html = '<table class="edt"><thead><tr><th style="width:90px">Début</th>' +
        jours.map(j => '<th>' + j + '</th>').join('') + '</tr></thead><tbody>';
      rows.forEach((t) => {
        html += '<tr><th>' + UI.esc(t) + '</th>';
        for (let j = 0; j < jours.length; j++) {
          const e = cells.find(x => x.jour === j && coursDebut(x) === t);
          if (e) {
            const m = matieres.find(mm => mm.id === e.matiereId);
            const en = enseignants.find(x => x.id === e.enseignantId);
            const sa = e.salleId ? salles.find(s => s.id === e.salleId) : null;
            html += '<td><strong>' + UI.esc(m ? m.libelle : '') + '</strong>' +
              (en ? '<br><small>' + UI.esc(Data.personneNom(en)) + '</small>' : '') +
              (sa ? '<br><small>' + UI.esc(sa.libelle) + '</small>' : '') +
              '<br><small>' + coursTimeLabel(e) + '</small></td>';
          } else html += '<td></td>';
        }
        html += '</tr>';
      });
      return html + '</tbody></table>';
    }

    // Impression de l'emploi du temps courant (avec en-tête école).
    async function printCreneaux() {
      try {
        if (!lastGrid) { UI.toast('Aucun emploi du temps à imprimer.', 'err'); return; }
        const eco = (await DB.get('ecole', 1)) || {};
        const titre = 'Emploi du temps' + (lastClasse ? ' — ' + Data.classeLabel(lastClasse) : '');
        UI.print(UI.letterhead(eco, { title: titre }, {}) + '<div class="edt-wrap">' + lastGrid + '</div>', titre);
      } catch (err) { UI.toast('Erreur lors de l\'impression : ' + (err && err.message || err), 'err'); }
    }

    async function renderTeacher() {
      const u = Auth.currentUser();
      const ens = (await DB.getAll('enseignants')).find(en => en.userId === u.id);
      if (!ens) { root.querySelector('#edt-body').innerHTML = '<div class="notice-warn notice">Aucune fiche enseignant reliée à votre compte.</div>'; return; }
      const { emplois, matieres, salles, classes } = await Data.common();
      const mine = emplois.filter(e => e.enseignantId === ens.id);
      if (!mine.length) { root.querySelector('#edt-body').innerHTML = '<div class="notice">Aucun cours ne vous est affecté.</div>'; return; }
      let html = '<div style="margin-bottom:8px"><button class="btn btn-outline no-print" id="te-print">🖨 Imprimer</button> <small class="hint">Emploi du temps — ' + UI.esc(Data.personneNom(ens)) + '</small></div>';
      html += '<table class="edt"><thead><tr><th style="width:90px">Début</th>' + JOURS.map(j => '<th>' + j + '</th>').join('') + '</tr></thead><tbody>';
      const rows = [];
      const rIdx = {};
      mine.forEach(c => { const t = coursDebut(c); if (rIdx[t] === undefined) { rIdx[t] = rows.length; rows.push(t); } });
      rows.sort();
      rows.forEach((t) => {
        html += '<tr><th>' + UI.esc(t) + '</th>';
        for (let j = 0; j < JOURS.length; j++) {
          const e = mine.find(x => x.jour === j && coursDebut(x) === t);
          if (e) {
            const m = matieres.find(mm => mm.id === e.matiereId);
            const cl = classes.find(c => c.id === e.classeId);
            html += '<td><div class="edt-cell"><strong>' + UI.esc(m ? m.libelle : '') + '</strong><span class="sub">' + UI.esc(cl ? Data.classeLabel(cl) : '') + '</span><span class="sub edt-time">' + coursTimeLabel(e) + '</span></div></td>';
          } else html += '<td></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table>';
      root.querySelector('#edt-body').innerHTML = html;
      const pb = root.querySelector('#te-print');
      if (pb) pb.onclick = async () => {
        const eco = (await DB.get('ecole', 1)) || {};
        UI.print(UI.letterhead(eco, { title: 'Emploi du temps — ' + Data.personneNom(ens) }, {}) +
          '<div class="edt-wrap">' + buildPrintTable(mine, matieres, [], salles, JOURS) + '</div>',
          'Emploi du temps — ' + Data.personneNom(ens));
      };
    }

    async function renderStudent() {
      const u = Auth.currentUser();
      const me = (await DB.getAll('eleves')).find(el => el.userId === u.id);
      if (!me || !me.classeId) { root.querySelector('#edt-body').innerHTML = '<div class="notice-warn notice">Votre classe ne vous est pas affectée.</div>'; return; }
      const { emplois, matieres, enseignants, classes } = await Data.common();
      const mine = emplois.filter(e => e.classeId === me.classeId);
      const cl = classes.find(c => c.id === me.classeId);
      let html = ' <div style="margin-bottom:8px"><button class="btn btn-outline no-print" id="st-print">🖨 Imprimer</button></div>';
      html += '<table class="edt"><thead><tr><th style="width:90px">Début</th>' + JOURS.map(j => '<th>' + j + '</th>').join('') + '</tr></thead><tbody>';
      const rows = [];
      const rIdx = {};
      mine.forEach(c => { const t = coursDebut(c); if (rIdx[t] === undefined) { rIdx[t] = rows.length; rows.push(t); } });
      rows.sort();
      rows.forEach((t) => {
        html += '<tr><th>' + UI.esc(t) + '</th>';
        for (let j = 0; j < JOURS.length; j++) {
          const e = mine.find(x => x.jour === j && coursDebut(x) === t);
          if (e) {
            const m = matieres.find(mm => mm.id === e.matiereId);
            const en = enseignants.find(x => x.id === e.enseignantId);
            html += '<td><div class="edt-cell"><strong>' + UI.esc(m ? m.libelle : '') + '</strong><span class="sub">' + UI.esc(en ? Data.personneNom(en) : '') + '</span><span class="sub edt-time">' + coursTimeLabel(e) + '</span></div></td>';
          } else html += '<td></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table>';
      root.querySelector('#edt-body').innerHTML = html;
      const pb = root.querySelector('#st-print');
      if (pb) pb.onclick = async () => {
        const eco = (await DB.get('ecole', 1)) || {};
        const titre = 'Emploi du temps' + (cl ? ' — ' + Data.classeLabel(cl) : '');
        UI.print(UI.letterhead(eco, { title: titre }, {}) +
          '<div class="edt-wrap">' + buildPrintTable(mine, matieres, enseignants, [], JOURS) + '</div>', titre);
      };
    }
  }
});